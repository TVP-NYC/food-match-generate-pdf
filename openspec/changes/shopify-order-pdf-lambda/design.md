# Design: Shopify Order PDF Lambda

## Architecture Overview
Use a clean, layered structure where the Lambda handler orchestrates request/response concerns, services encapsulate domain logic and integrations, and utilities centralize cross-cutting concerns.

```text
API Gateway (POST)
  -> handler.js
     -> validate input (utils)
     -> shopifyService.getOrderById(orderId)
     -> shopifyService.enrichLineItems(...)
     -> pdfService.buildOrdersPdf(...)
     -> response utils (200/400/404/500)
```

## Project Layout
```text
src/
 ├── handler/
 │    └── handler.js
 ├── services/
 │    ├── shopifyService.js
 │    └── pdfService.js
 └── utils/
      ├── validation.js
      ├── response.js
      ├── errors.js
      └── logger.js
```

## Request Contract
- Method: `POST`
- Body:
  - `orderIds` (required): array of non-empty strings

Validation rules:
- Body must be valid JSON.
- `orderIds` must exist, be an array, contain at least one element.
- Every `orderId` must be a non-empty string.

## Shopify Integration Design
`shopifyService.js` responsibilities:
- Build authenticated GraphQL requests using environment variables:
  - `SHOPIFY_STORE_DOMAIN`
  - `SHOPIFY_ACCESS_TOKEN`
  - `SHOPIFY_API_VERSION` (default fallback)
- Query order details by Shopify order ID.
- Normalize order payload into internal shape for PDF rendering:
  - order number/name
  - creation date
  - customer display name/email (if present)
  - line items: title, SKU, quantity, unit price, total
- Optional product enrichment path for missing fields (e.g., SKU/vendor/product type) via product query.
- Throw typed errors for not found vs internal API failures.

## PDF Generation Design
`pdfService.js` responsibilities:
- Use `pdf-lib` (minimal footprint, no headless binaries).
- Build a single PDF containing all requested orders.
- Add title + generation timestamp.
- For each order:
  - order metadata block
  - table-like line item listing
  - page break when needed
- Return `Uint8Array`/Buffer for base64 encoding.

## Error Handling
Define custom errors in `utils/errors.js`:
- `ValidationError` -> HTTP 400
- `NotFoundError` -> HTTP 404
- `InternalError` -> HTTP 500

Handler mapping:
- Catch and map typed errors to consistent JSON response body.
- Add `requestId` (from Lambda context) in logs and error payload when appropriate.
- Avoid exposing Shopify token, query internals, or stack traces to clients.

## Logging Strategy
`utils/logger.js`:
- Structured logs (`info`, `warn`, `error`) using JSON-friendly payloads.
- Log key checkpoints:
  - request received
  - input validated
  - each order fetch start/end
  - enrichment start/end (if used)
  - PDF generation start/end
  - response status sent
- Include correlation fields: `requestId`, order IDs count, failing order ID.

## Response Strategy (API Gateway Lambda Proxy)
Success:
- `statusCode: 200`
- `isBase64Encoded: true`
- headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="shopify-orders-summary.pdf"`
  - `Cache-Control: no-store`
- `body`: base64 PDF bytes

Errors:
- `400`, `404`, `500` JSON body with `message` and optional `code`.

## Production Readiness Notes
- Timeouts: set Lambda timeout to safely cover multi-order PDF generation.
- Memory: choose memory size that supports PDF creation for expected batch size.
- Concurrency: use controlled concurrency for Shopify calls to avoid rate limits.
- Security: access token only via env vars/secrets; never log secrets.
- Dependency minimization: runtime-native fetch + one PDF library.
