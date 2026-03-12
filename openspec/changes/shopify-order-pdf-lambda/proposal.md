# Proposal: Shopify Order PDF Lambda

## Problem
Generate product label PDFs from Shopify orders for the FoodMatch Samples operation. The function is invoked server-to-server (no end-user interaction) and must return the PDF directly in the response.

## Solution
An AWS Lambda function that:
1. Authenticates with Shopify via the **client credentials grant** (OAuth 2.0) using the app's `client_id` and `client_secret` — no static access tokens.
2. Fetches one or more orders from the Shopify Admin GraphQL API.
3. Generates a PDF with product label cards (one card per line item).
4. Returns the PDF base64-encoded in the Lambda response body — no storage, streamed directly to the caller.

## Non-goals
- No web server, no Express, no HTTP routing inside the Lambda.
- No CORS handling — that is managed at the API Gateway / Shopify panel level.
- No authentication middleware — the Lambda trusts its caller (API Gateway with IAM or resource policy).
- No PDF storage — the file is generated in memory and returned in the response.

## Tech stack
- Runtime: Node.js 22 (ESM)
- PDF generation: `pdf-lib`
- Shopify API: `graphql-request`
- Local development & deploy: `node-lambda`
