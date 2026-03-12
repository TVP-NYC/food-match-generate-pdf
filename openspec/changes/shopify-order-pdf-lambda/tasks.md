# Tasks: Shopify Order PDF Lambda

## Status: ✅ Complete

## Completed

- [x] Bootstrap project with `node-lambda` (removed Express / web server)
- [x] Implement Shopify auth via client credentials grant with in-memory token cache
- [x] GraphQL order query with line item and product data
- [x] Product enrichment for missing SKU / vendor / product type fields
- [x] PDF generation with `pdf-lib` — 2-column label card layout
- [x] Lambda handler with typed error handling (400 / 404 / 500)
- [x] Input validation for direct invocation and API Gateway proxy events
- [x] Configure `read_orders`, `read_all_orders`, `read_customers`, `read_products` scopes in `shopify.app.toml`
- [x] Deploy app to Shopify and verify scopes on installed store
- [x] End-to-end test: real order `gid://shopify/Order/6800123035844` → PDF generated ✓
