import { validatePostRequest } from "../utils/validation.js";
import { buildPdfResponse, buildJsonResponse } from "../utils/response.js";
import { NotFoundError, ValidationError, InternalError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { getOrderById, enrichLineItems } from "../services/shopifyService.js";
import { buildOrdersPdf } from "../services/pdfService.js";

export const handler = async (event, context) => {
    const logger = createLogger();

    logger.start("handler", {
        method: event && event.httpMethod ? event.httpMethod : "unknown",
    });

    try {
        const { orderIds } = validatePostRequest(event);
        logger.info("handler - Order IDs received", { orderCount: orderIds.length });

        const orders = [];
        for (const orderId of orderIds) {
            logger.info("shopifyService.getOrderById - Starting order fetch", { orderId });
            const order = await getOrderById(orderId, logger);
            const enrichedOrder = await enrichLineItems(order, logger);
            orders.push(enrichedOrder);
            logger.info("shopifyService.getOrderById - Order fetched", {
                orderId,
                lineItems: enrichedOrder.lineItems.length,
            });
        }

        logger.info("pdfService.buildOrdersPdf - Starting PDF generation", { orderCount: orders.length });
        const pdfBytes = await buildOrdersPdf(orders);
        logger.info("pdfService.buildOrdersPdf - PDF generated", {
            orderCount: orders.length,
            bytes: pdfBytes.length,
        });

        logger.end("handler", {
            statusCode: 200,
            orderCount: orders.length,
        });
        return buildPdfResponse(pdfBytes, "labels.pdf");
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn("handler - Validation error", {
                code: error.code,
                message: error.message,
            });
            logger.end("handler", {
                statusCode: 400,
            });
            return buildJsonResponse(400, {
                code: error.code,
                message: error.message,
            });
        }

        if (error instanceof NotFoundError) {
            logger.warn("shopifyService.getOrderById - Order not found", {
                code: error.code,
                message: error.message,
                orderId: error.details && error.details.orderId ? error.details.orderId : undefined,
            });
            logger.end("handler", {
                statusCode: 404,
            });
            return buildJsonResponse(404, {
                code: error.code,
                message: error.message,
            });
        }

        const internalError = error instanceof InternalError ? error : new InternalError();
        logger.error("handler - Internal error", {
            code: internalError.code,
            message: internalError.message,
            cause: error && error.message ? error.message : "unknown-error",
        });

        logger.end("handler", {
            statusCode: 500,
        });

        return buildJsonResponse(500, {
            code: internalError.code,
            message: internalError.message,
        });
    }
};
