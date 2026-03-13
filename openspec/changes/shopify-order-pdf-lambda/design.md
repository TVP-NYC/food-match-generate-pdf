# Design: Shopify Order PDF Lambda

## Architecture

```
Caller (API Gateway / direct invoke)
  → index.js                        entry point (re-exports handler)
    → src/handler/handler.js        orchestration
      → src/utils/validation.js     parse & validate event payload
      → src/services/shopifyService.js
          getAccessToken()          client credentials grant → cached token
          getOrderById()            GraphQL order query
          enrichLineItems()         GraphQL product enrich (if needed)
      → src/services/pdfService.js  build PDF with pdf-lib
      → src/utils/response.js       build Lambda proxy response
```

## Project layout

```
index.js                            node-lambda entry point
event.json                          local test event
.env.example                        env vars template
src/
  handler/handler.js
  services/
    shopifyService.js
    pdfService.js
  utils/
    validation.js
    response.js
    errors.js
```

## Authentication — Client Credentials Grant

On every invocation the service calls:

```
POST https://{store}.myshopify.com/admin/oauth/access_token
  { client_id, client_secret, grant_type: "client_credentials" }
```

The token is cached in module-level memory and reused across Lambda warm starts. It is refreshed 5 minutes before the 24h expiry (`expires_in: 86399`).

**Required app scopes** (configured in `shopify.app.toml`):
```
read_orders, read_all_orders, read_customers, read_products
```

## Event contract

The handler accepts both formats:

**Direct Lambda invocation:**
```json
{ "orderIds": ["gid://shopify/Order/123"] }
```

**API Gateway proxy event:**
```json
{ "body": "{\"orderIds\":[\"gid://shopify/Order/123\"]}", "isBase64Encoded": false }
```

## Response

**Success — 200:**
```json
{
  "statusCode": 200,
  "isBase64Encoded": true,
  "headers": {
    "Content-Type": "application/pdf",
    "Content-Disposition": "attachment; filename=\"Labels.pdf\""
  },
  "body": "<base64 PDF bytes>"
}
```
PDF is generated in memory and streamed in the response — nothing is stored.

**Errors:**
| Status | Code | Cause |
|--------|------|-------|
| 400 | `INVALID_INPUT` / `INVALID_ORDER_IDS` | Bad payload |
| 404 | `ORDER_NOT_FOUND` | Order GID not found in Shopify |
| 500 | `SHOPIFY_AUTH_ERROR` | Token request failed |
| 500 | `SHOPIFY_GRAPHQL_ERROR` | GraphQL errors returned |
| 500 | `INTERNAL_ERROR` | PDF generation or unexpected failure |

## PDF layout

- Page size: Letter (612 × 792pt)
- 2-column grid, exactly 7 rows per page
- One card per line item containing: company logo, SKU + product title, sample size (variant), packed date, allergen footer

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | ✅ | — | e.g. `store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | ✅ | — | App client ID |
| `SHOPIFY_CLIENT_SECRET` | ✅ | — | App client secret |
| `SHOPIFY_API_VERSION` | ❌ | `2026-01` | Shopify API version |
| `COMPANY_LOGO_PATH` | ❌ | `assets/company-logo.png` | Logo path |

## Local development

```bash
cp .env.example .env   # fill in credentials
npm run invoke         # run with event.json
npm run package        # zip for AWS
npm run deploy         # deploy to AWS
```
