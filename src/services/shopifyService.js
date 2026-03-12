import { GraphQLClient, gql, ClientError } from "graphql-request";
import { NotFoundError, InternalError, ValidationError } from "../utils/errors.js";

const DEFAULT_SHOPIFY_API_VERSION = "2026-01";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// Module-level token cache — reused across Lambda warm starts
let cachedToken = null;
let tokenExpiresAt = 0;
let cachedClient = null;

function getShopifyConfig() {
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION;

    if (!storeDomain || !clientId || !clientSecret) {
        throw new InternalError(
            "Missing Shopify env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET",
            "SHOPIFY_CONFIG_ERROR"
        );
    }

    return { storeDomain, clientId, clientSecret, apiVersion };
}

async function getAccessToken() {
    const now = Date.now();

    if (cachedToken && now < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
        console.log("[shopify] Using cached access token");
        return cachedToken;
    }

    const config = getShopifyConfig();
    const tokenUrl = `https://${config.storeDomain}/admin/oauth/access_token`;

    console.log("[shopify] Fetching new access token via client credentials grant");

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: "client_credentials",
        }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new InternalError(
            `Shopify token request failed: ${response.status} ${text}`,
            "SHOPIFY_AUTH_ERROR"
        );
    }

    const data = await response.json();

    cachedToken = data.access_token;
    tokenExpiresAt = now + data.expires_in * 1000;
    cachedClient = null; // reset GraphQL client so it picks up the new token

    console.log(`[shopify] Access token obtained, expires in ${data.expires_in}s`);
    return cachedToken;
}

function isValidOrderGid(orderId) {
    return typeof orderId === "string" && /^gid:\/\/shopify\/Order\/\d+$/.test(orderId.trim());
}

const ORDER_QUERY = gql`
    query GetOrder($id: ID!) {
        order(id: $id) {
            id
            name
            createdAt
            customer {
                displayName
                email
            }
            lineItems(first: 100) {
                edges {
                    node {
                        id
                        title
                        quantity
                        originalUnitPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        discountedTotalSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        sku
                        variant {
                            id
                            sku
                            title
                            image {
                                url
                            }
                            product {
                                id
                                title
                                vendor
                                productType
                                featuredImage {
                                    url
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

const PRODUCTS_QUERY = gql`
    query ProductsByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
            ... on Product {
                id
                title
                vendor
                productType
                featuredImage {
                    url
                }
            }
        }
    }
`;

async function getGraphQLClient() {
    const config = getShopifyConfig();
    const token = await getAccessToken();
    const endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;

    if (!cachedClient) {
        cachedClient = new GraphQLClient(endpoint, {
            headers: { "X-Shopify-Access-Token": token },
        });
    }

    return cachedClient;
}

async function runGraphqlQuery(query, variables) {
    const client = await getGraphQLClient();

    try {
        return await client.request(query, variables);
    } catch (error) {
        if (error instanceof ClientError) {
            if (error.response && error.response.status === 404) {
                throw new NotFoundError("Order not found", "ORDER_NOT_FOUND");
            }

            throw new InternalError("Shopify GraphQL returned errors", "SHOPIFY_GRAPHQL_ERROR", {
                status: error.response ? error.response.status : undefined,
                errors:
                    error.response && Array.isArray(error.response.errors)
                        ? error.response.errors.map((e) => e.message)
                        : [error.message],
            });
        }

        throw new InternalError("Failed to connect to Shopify", "SHOPIFY_NETWORK_ERROR", {
            reason: error && error.message ? error.message : "unknown",
        });
    }
}

function normalizeOrder(order) {
    const lineItems = (order.lineItems && order.lineItems.edges ? order.lineItems.edges : []).map((edge) => {
        const line = edge.node;
        const unitAmount =
            line.originalUnitPriceSet && line.originalUnitPriceSet.shopMoney
                ? Number.parseFloat(line.originalUnitPriceSet.shopMoney.amount)
                : 0;
        const totalAmount =
            line.discountedTotalSet && line.discountedTotalSet.shopMoney
                ? Number.parseFloat(line.discountedTotalSet.shopMoney.amount)
                : unitAmount * line.quantity;

        return {
            id: line.id,
            title: line.title,
            sku: line.sku || (line.variant ? line.variant.sku : "") || "",
            variantName: (line.variant && line.variant.title) || "",
            quantity: line.quantity,
            unitPrice: unitAmount,
            totalPrice: totalAmount,
            currencyCode:
                (line.originalUnitPriceSet &&
                    line.originalUnitPriceSet.shopMoney &&
                    line.originalUnitPriceSet.shopMoney.currencyCode) ||
                "USD",
            productId: line.variant && line.variant.product ? line.variant.product.id : null,
            productTitle: line.variant && line.variant.product ? line.variant.product.title : null,
            vendor: line.variant && line.variant.product ? line.variant.product.vendor : null,
            productType: line.variant && line.variant.product ? line.variant.product.productType : null,
            imageUrl:
                (line.variant && line.variant.image && line.variant.image.url) ||
                (line.variant &&
                    line.variant.product &&
                    line.variant.product.featuredImage &&
                    line.variant.product.featuredImage.url) ||
                null,
        };
    });

    return {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        customerName: order.customer ? order.customer.displayName || "" : "",
        customerEmail: order.customer ? order.customer.email || "" : "",
        lineItems,
    };
}

async function getOrderById(orderId) {
    if (!isValidOrderGid(orderId)) {
        throw new ValidationError(`Invalid Shopify order GID: ${orderId}`, "INVALID_ORDER_ID");
    }

    console.log(`[shopify] Fetching order ${orderId}`);
    const data = await runGraphqlQuery(ORDER_QUERY, { id: orderId.trim() });
    const order = data && data.order ? data.order : null;

    if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`, "ORDER_NOT_FOUND", { orderId });
    }

    const normalized = normalizeOrder(order);
    console.log(`[shopify] Order ${orderId} fetched — ${normalized.lineItems.length} line items`);
    return normalized;
}

async function fetchProductsByIds(productIds) {
    if (!productIds || productIds.length === 0) return new Map();

    const data = await runGraphqlQuery(PRODUCTS_QUERY, { ids: productIds });
    const products = data && data.nodes ? data.nodes : [];

    const byId = new Map();
    for (const product of products) {
        if (product && product.id) byId.set(product.id, product);
    }
    return byId;
}

async function enrichLineItems(order) {
    const missing = order.lineItems.filter(
        (item) => item.productId && (!item.productTitle || !item.vendor)
    );

    if (missing.length === 0) return order;

    const uniqueIds = [...new Set(missing.map((item) => item.productId))];
    console.log(`[shopify] Enriching ${uniqueIds.length} products`);

    const productById = await fetchProductsByIds(uniqueIds);

    const lineItems = order.lineItems.map((item) => {
        if (!item.productId) return item;
        const product = productById.get(item.productId);
        if (!product) return item;

        return {
            ...item,
            productTitle: item.productTitle || product.title || null,
            vendor: item.vendor || product.vendor || null,
            productType: item.productType || product.productType || null,
            imageUrl:
                item.imageUrl ||
                (product.featuredImage && product.featuredImage.url ? product.featuredImage.url : null),
        };
    });

    return { ...order, lineItems };
}

export { getOrderById, enrichLineItems };
