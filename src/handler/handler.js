import { validateRequest } from "../utils/validation.js";
import { buildPdfResponse, buildJsonResponse } from "../utils/response.js";
import { NotFoundError, ValidationError, InternalError } from "../utils/errors.js";
import { getOrderById, enrichLineItems } from "../services/shopifyService.js";
import { buildOrdersPdf } from "../services/pdfService.js";

function getHeader(event, name) {
    const headers = event && event.headers ? event.headers : {};
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lower) return value;
    }
    return "";
}

export const handler = async (event, context) => {
    const requestId = context && context.awsRequestId ? context.awsRequestId : "local";
    console.log(`[handler] Start — requestId: ${requestId}`);

    try {
        const { orderIds } = validateRequest(event);
        console.log(`[handler] Orders requested: ${orderIds.join(", ")}`);

        const orders = [];
        for (const orderId of orderIds) {
            const order = await getOrderById(orderId);
            const enriched = await enrichLineItems(order);
            orders.push(enriched);
        }

        console.log(`[handler] Generating PDF for ${orders.length} order(s)`);
        const pdfBytes = await buildOrdersPdf(orders);
        console.log(`[handler] PDF generated — ${pdfBytes.length} bytes`);

        const pdfResponse = buildPdfResponse(pdfBytes, "labels.pdf");

        // The Shopify extension calls with X-PDF-Response-Mode: base64-json
        // and expects the full Lambda response envelope as JSON body,
        // because AWS Lambda URL would otherwise decode the base64 and stream raw bytes.
        const responseMode = getHeader(event, "x-pdf-response-mode").toLowerCase();
        if (responseMode === "base64-json") {
            return {
                statusCode: 200,
                isBase64Encoded: false,
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                body: JSON.stringify(pdfResponse),
            };
        }

        return pdfResponse;
    } catch (error) {
        if (error instanceof ValidationError) {
            console.warn(`[handler] Validation error: ${error.code} — ${error.message}`);
            return buildJsonResponse(400, { code: error.code, message: error.message });
        }

        if (error instanceof NotFoundError) {
            console.warn(`[handler] Not found: ${error.code} — ${error.message}`);
            return buildJsonResponse(404, { code: error.code, message: error.message });
        }

        const internalError = error instanceof InternalError ? error : new InternalError();
        console.error(`[handler] Internal error: ${internalError.code} — ${internalError.message}`, error);
        return buildJsonResponse(500, { code: internalError.code, message: internalError.message });
    }
};
