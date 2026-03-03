# Shopify Order PDF Lambda

AWS Lambda (Node.js 22) that receives a POST request with Shopify order GIDs, fetches order details from Shopify GraphQL Admin API, and returns a downloadable PDF as base64.

Shopify GraphQL communication is implemented with `graphql-request`.

The codebase uses ESM (`"type": "module"`).

## Required environment variables

- `SHOPIFY_STORE_DOMAIN` (example: `my-shop.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` (Shopify Admin API access token)
- `SHOPIFY_API_VERSION` (optional, default: `2026-01`)
- `COMPANY_LOGO_PATH` (optional local file path, default: `assets/company-logo.png`)
- `LOG_LEVEL` (optional: `error`, `warn`, `info`; default: `info`)
- `LOG_FORMAT` (optional: `pretty` or `json`; default: `pretty`)

## Request contract

- Method: `POST`
- Body:

```json
{
  "orderIds": ["gid://shopify/Order/1234567890"]
}
```

## Response contract

- `200` with `application/pdf` and `isBase64Encoded: true`
- `400` invalid input
- `404` order not found (batch request aborts if any order is missing)
- `500` internal server error

## Local setup

1. Install dependencies:
   - `npm install`
2. Run local HTTP server (Express) for Postman testing:
   - `npm run server:local`
   - `npm test` (hot reload with nodemon)
   - health endpoint: `GET http://localhost:3000/health`
   - PDF endpoint: `POST http://localhost:3000/generate-pdf`

## Quick test (PowerShell)

```powershell
$env:SHOPIFY_STORE_DOMAIN="my-shop.myshopify.com"
$env:SHOPIFY_ACCESS_TOKEN="shpat_xxx"
$env:SHOPIFY_API_VERSION="2026-01"
$env:LOG_LEVEL="info"
$env:LOG_FORMAT="pretty"
npm install
npm test
npm run server:local
```

Example Postman body for `POST /generate-pdf`:

```json
{
   "orderIds": ["gid://shopify/Order/6256884220081"]
}
```

## App entrypoint

- `app.handler`

## Deployment notes

- Configure API Gateway proxy integration.
- Ensure Lambda timeout/memory are sized for batch PDF generation.
- Do not log or expose secrets.
