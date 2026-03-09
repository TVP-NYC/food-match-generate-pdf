# Tasks: Shopify Order PDF Lambda

## 1. Scaffold and configuration
- [x] Create source tree:
  - [x] `src/handler/handler.js`
  - [x] `src/services/shopifyService.js`
  - [x] `src/services/pdfService.js`
  - [x] `src/utils/{validation,response,errors,logger}.js`
- [x] Add minimal dependencies (prefer `pdf-lib`, avoid unnecessary packages).
- [x] Define required env vars and defaults.

## 2. Input validation and request handling
- [x] Implement POST-only guard in handler.
- [x] Parse JSON safely and validate `orderIds` contract.
- [x] Return `400` for invalid payloads with clear error messages.
- [x] Add request-scoped logging context (`requestId`).

## 3. Shopify GraphQL service
- [x] Implement authenticated GraphQL request helper.
- [x] Implement `getOrderById(orderId)` and normalize response.
- [x] Implement optional `enrichLineItems` for missing product fields.
- [x] Map missing order to `NotFoundError` (`404`).
- [x] Map API/network failures to internal errors (`500`).

## 4. PDF service
- [x] Implement `buildOrdersPdf(orders)` using `pdf-lib`.
- [x] Add order header and line-item listing with pagination support.
- [x] Return bytes suitable for base64 output.

## 5. Response and error mapping
- [x] Implement response utilities for PDF and JSON errors.
- [x] Return `200` with headers:
  - [x] `Content-Type: application/pdf`
  - [x] `Content-Disposition: attachment; filename="shopify-orders-summary.pdf"`
  - [x] `isBase64Encoded: true`
- [x] Return `404` when any requested order is not found.
- [x] Return `500` for unexpected failures.

## 6. Production hardening
- [x] Ensure logs cover start/end and per-order processing checkpoints.
- [x] Confirm no secrets are logged.
- [x] Add concise usage/deployment notes for Lambda environment setup.
- [ ] Run a local sanity test with sample `orderIds` payload.
