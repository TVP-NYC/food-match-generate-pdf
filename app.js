import { handler as ordersPdfHandler } from "./src/handler/handler.js";
import { buildJsonResponse } from "./src/utils/response.js";
import { createLogger } from "./src/utils/logger.js";

export const handler = async (event, context) => {
    const logger = createLogger();

    const method = event && event.httpMethod ? event.httpMethod : "UNKNOWN";
    const path = event && event.path ? event.path : "/";
    logger.start("app.handler", { method, path });

    if (method === "POST") {
        const response = await ordersPdfHandler(event, context);
        logger.end("app.handler", {
            method,
            path,
            statusCode: response && response.statusCode ? response.statusCode : 200,
        });
        return response;
    }

    logger.warn("app.handler - Unsupported HTTP method", { method, path });
    const response = buildJsonResponse(405, {
        code: "METHOD_NOT_ALLOWED",
        message: "Only POST is allowed",
    });
    logger.end("app.handler", {
        method,
        path,
        statusCode: 405,
    });
    return response;
};
