# Proposal: Shopify Order PDF Lambda

## Summary
Create an AWS Lambda function (Node.js 22) that receives a POST request with one or many Shopify order IDs, fetches order/product data from Shopify GraphQL, builds a consolidated PDF, and returns it as a downloadable base64-encoded file.

## Why
Operations teams need a fast, reliable way to generate downloadable order summaries without manual exports from Shopify. The endpoint should support single and batch order requests with production-grade validation, observability, and error handling.

## Goals
- Accept `POST` JSON input with required `orderIds: string[]`.
- For each order ID, fetch order details from Shopify GraphQL.
- Extract line items and optionally enrich with product details when needed.
- Generate one PDF summarizing all requested orders.
- Return `200` with binary-safe response (`isBase64Encoded: true`, `application/pdf`, download headers).
- Return explicit errors: `400` invalid input, `404` order not found, `500` internal error.
- Keep architecture clean (handler/services/utilities) and dependencies minimal.

## Non-goals
- Persisting generated PDFs in S3.
- Async job orchestration (SQS/Step Functions).
- Shopify webhook registration/verification in this change.
- UI or dashboard changes.

## Scope
- New Lambda code under `src/` using:
  - `src/handler/handler.js`
  - `src/services/shopifyService.js`
  - `src/services/pdfService.js`
  - supporting utilities for validation, response shaping, and logging.
- Environment-based Shopify configuration (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, optional API version).
- Production-ready response contracts for API Gateway Lambda proxy integration.

## Success Criteria
- Valid POST request with one or many valid IDs returns `200` and a downloadable PDF.
- Malformed body or missing/invalid `orderIds` returns `400`.
- Any requested non-existing order returns `404` with clear message.
- Unexpected failures return `500` without leaking sensitive details.
- Logs provide enough traceability to debug request flow and per-order processing.

## Risks and Mitigations
- Shopify API rate limits in batch mode → sequential fetch or controlled concurrency and clear logging.
- Partial failures across many order IDs → deterministic behavior (fail fast with actionable 404, otherwise 500).
- PDF size growth for large batches → concise formatting and pagination strategy in PDF service.
