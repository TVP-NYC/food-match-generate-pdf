import { GraphQLClient, gql, ClientError } from "graphql-request";
import { NotFoundError, InternalError, ValidationError } from "../utils/errors.js";

const DEFAULT_SHOPIFY_API_VERSION = "2026-01";

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

let cachedClient;
let cachedEndpoint;
let cachedToken;

function getShopifyConfig() {
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION;

    if (!storeDomain || !accessToken) {
        throw new InternalError("Shopify environment variables are not configured", "SHOPIFY_CONFIG_ERROR");
    }

    return {
        storeDomain,
        accessToken,
        apiVersion,
    };
}

function isValidOrderGid(orderId) {
    return typeof orderId === "string" && /^gid:\/\/shopify\/Order\/\d+$/.test(orderId.trim());
}

async function runGraphqlQuery(query, variables) {
    const config = getShopifyConfig();
    const endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;

    if (!cachedClient || cachedEndpoint !== endpoint || cachedToken !== config.accessToken) {
        cachedClient = new GraphQLClient(endpoint, {
        headers: {
            "X-Shopify-Access-Token": config.accessToken,
        },
        });
        cachedEndpoint = endpoint;
        cachedToken = config.accessToken;
    }

    try {
        return await cachedClient.request(query, variables);
    } catch (error) {
        if (error instanceof ClientError) {
            if (error.response && error.response.status === 404) {
                throw new NotFoundError("Order not found", "ORDER_NOT_FOUND");
            }

            throw new InternalError("Shopify GraphQL returned errors", "SHOPIFY_GRAPHQL_ERROR", {
                status: error.response ? error.response.status : undefined,
                errors:
                error.response && Array.isArray(error.response.errors)
                    ? error.response.errors.map((entry) => entry.message)
                    : [error.message],
            });
        }

        throw new InternalError("Failed to connect to Shopify", "SHOPIFY_NETWORK_ERROR", {
            reason: error && error.message ? error.message : "unknown-network-error",
        });
    }
}

function normalizeOrder(order) {
    const lineItems = (order.lineItems && order.lineItems.edges ? order.lineItems.edges : []).map((edge) => {
        const line = edge.node;
        const unitAmount = line.originalUnitPriceSet && line.originalUnitPriceSet.shopMoney
        ? Number.parseFloat(line.originalUnitPriceSet.shopMoney.amount)
        : 0;
        const totalAmount = line.discountedTotalSet && line.discountedTotalSet.shopMoney
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

async function getOrderById(orderId, logger) {
    if (!isValidOrderGid(orderId)) {
        throw new ValidationError(`Invalid Shopify order GID: ${orderId}`, "INVALID_ORDER_ID");
    }

    const data = await runGraphqlQuery(ORDER_QUERY, { id: orderId.trim() });
    const order = data && data.order ? data.order : null;

    if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`, "ORDER_NOT_FOUND", { orderId });
    }

    if (logger) {
        logger.info("shopify.order.normalized", {
            orderId,
            lineItems: order.lineItems && order.lineItems.edges ? order.lineItems.edges.length : 0,
        });
    }

    return normalizeOrder(order);
}

async function fetchProductsByIds(productIds) {
    if (!productIds || productIds.length === 0) {
        return new Map();
    }

    const data = await runGraphqlQuery(PRODUCTS_QUERY, { ids: productIds });
    const products = data && data.nodes ? data.nodes : [];

    const byId = new Map();
    for (const product of products) {
        if (product && product.id) {
            byId.set(product.id, product);
        }
    }
    return byId;
}

async function enrichLineItems(order, logger) {
    const missingProductItems = order.lineItems.filter(
        (lineItem) => lineItem.productId && (!lineItem.productTitle || !lineItem.vendor)
    );

    if (missingProductItems.length === 0) {
        return order;
    }

    const uniqueIds = [...new Set(missingProductItems.map((item) => item.productId))];
    if (logger) {
        logger.info("shopify.products.enrich.start", { productCount: uniqueIds.length });
    }

    const productById = await fetchProductsByIds(uniqueIds);
    const lineItems = order.lineItems.map((lineItem) => {
        if (!lineItem.productId) {
            return lineItem;
        }

        const product = productById.get(lineItem.productId);
        if (!product) {
            return lineItem;
        }

        return {
            ...lineItem,
            productTitle: lineItem.productTitle || product.title || null,
            vendor: lineItem.vendor || product.vendor || null,
            productType: lineItem.productType || product.productType || null,
            imageUrl:
                lineItem.imageUrl ||
                (product.featuredImage && product.featuredImage.url ? product.featuredImage.url : null),
        };
    });

    if (logger) {
        logger.info("shopify.products.enrich.success", { productCount: uniqueIds.length });
    }

    return {
        ...order,
        lineItems,
    };
}

export {
    getOrderById,
    enrichLineItems,
};
