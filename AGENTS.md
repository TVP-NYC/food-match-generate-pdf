# AGENTS.md — food-match-generate-pdf

## What this is

AWS Lambda function that generates product label PDFs from Shopify orders. It authenticates with Shopify via OAuth 2.0 client credentials grant, fetches order data through the Admin GraphQL API, and returns a PDF base64-encoded in the Lambda response — nothing is stored.

## Project layout

```
index.js                        Entry point — re-exports handler for node-lambda
event.json                      Local test event (used by npm run invoke)
.env.example                    Environment variables template
assets/
  company-logo.png              Logo embedded in every PDF card
src/
  handler/handler.js            Lambda handler — orchestrates the full flow
  services/
    shopifyService.js           Shopify auth (client credentials) + GraphQL queries
    pdfService.js               PDF generation with pdf-lib
  utils/
    validation.js               Parse and validate the event payload
    response.js                 Build Lambda proxy responses (PDF + JSON)
    errors.js                   Typed errors: ValidationError, NotFoundError, InternalError
openspec/
  changes/shopify-order-pdf-lambda/
    proposal.md
    design.md
    tasks.md
```

## Local development

```bash
cp .env.example .env    # fill in credentials
npm run invoke          # run Lambda locally with event.json
npm run package         # zip for AWS upload
npm run deploy          # deploy to AWS via node-lambda
```

Uses [node-lambda](https://github.com/motdotla/node-lambda) — no Express, no local HTTP server.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | ✅ | — | e.g. `store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | ✅ | — | App client ID (from Partners dashboard) |
| `SHOPIFY_CLIENT_SECRET` | ✅ | — | App client secret |
| `SHOPIFY_API_VERSION` | ❌ | `2026-01` | Shopify Admin API version |
| `COMPANY_LOGO_PATH` | ❌ | `assets/company-logo.png` | Path to logo embedded in PDF |

## Shopify app scopes

Configured in `food-match-admin-order-app/shopify.app.toml`:

```
read_orders, read_all_orders, read_customers, read_products
```

If you add fields to the GraphQL queries that require additional scopes, update the `.toml`, run `shopify app deploy --allow-updates` from `food-match-admin-order-app/`, and have the store owner approve the update.

## Event format

The handler accepts both direct Lambda invocations and API Gateway proxy events:

```json
{ "orderIds": ["gid://shopify/Order/123456789"] }
```

## Key decisions

- **No web server** — Lambda only. CORS is handled at the API Gateway / Shopify panel level.
- **No static access tokens** — Shopify deprecated them. Auth uses client credentials grant; token is cached in module memory and refreshed 5 min before expiry (24h TTL).
- **No PDF storage** — generated in memory, returned as base64 in the response body.
- **No custom logger** — plain `console.log/warn/error` only.
- **ESM throughout** — `"type": "module"` in package.json, all files use `import/export`.

## Adding fields to the PDF

1. Update the GraphQL query in `src/services/shopifyService.js` to fetch the new data.
2. Update `normalizeOrder()` in the same file to map it to the internal order shape.
3. Update `drawProductCard()` in `src/services/pdfService.js` to render the new field.

## Dependencies

| Package | Role |
|---|---|
| `pdf-lib` | PDF generation (no headless browser) |
| `graphql-request` | Shopify Admin GraphQL client |
| `node-lambda` (dev) | Local runner + AWS deploy tool |
