import { handler as ordersPdfHandler } from "./src/handler/handler.js";
import { buildJsonResponse } from "./src/utils/response.js";
import { createLogger, runWithLogContext } from "./src/utils/logger.js";

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "*";
const requireAuth = String(process.env.LOCAL_REQUIRE_AUTH || "false").toLowerCase() === "true";

function withCorsHeaders(response, reqOrigin) {
    const baseHeaders = response && response.headers ? response.headers : {};

    let allowedOrigin = corsOrigin;

    if (corsOrigin.includes(",")) {
        const origins = corsOrigin.split(",").map(o => o.trim());
        allowedOrigin = origins.includes(reqOrigin) ? reqOrigin : origins[0];
    }

    return {
        ...response,
        headers: {
            ...baseHeaders,
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,x-pdf-response-mode,X-PDF-RESPONSE-MODE",
            "Access-Control-Expose-Headers": "Content-Disposition,Content-Type",
        },
    };
}

function getHeader(event, headerName) {
    if (!event || !event.headers) {
        return "";
    }

    const headers = event.headers;
    const directValue = headers[headerName];
    if (directValue) {
        return directValue;
    }

    const lowered = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === lowered) {
            return value;
        }
    }

    return "";
}

function hasBearerAuth(event) {
    const authorization = getHeader(event, "authorization");
    return typeof authorization === "string" && /^Bearer\s+.+/i.test(authorization.trim());
}

function buildRequestTraceContext(event, context) {
    const headerTraceId = getHeader(event, "x-correlation-id") || getHeader(event, "x-request-id");
    const awsRequestId = context && context.awsRequestId ? context.awsRequestId : "";

    return {
        traceId: headerTraceId || awsRequestId,
        requestId: awsRequestId,
    };
}

export const handler = async (event, context) => {
    const traceContext = buildRequestTraceContext(event, context);

    return runWithLogContext(traceContext, async () => {
        const logger = createLogger();

        const method = event && event.httpMethod ? event.httpMethod : "UNKNOWN";
        const path = event && event.path ? event.path : "/";
        logger.start("app.handler", { method, path });

        if (method === "OPTIONS") {
            const response = withCorsHeaders({
                statusCode: 204,
                headers: { "Cache-Control": "no-store" },
                body: "",
            }, getHeader(event, "origin"));
            return response;
        }

        if (method === "POST") {
            if (requireAuth && !hasBearerAuth(event)) {
                logger.warn("app.handler - Missing or invalid bearer token", { method, path, statusCode: 401 });
                const response = withCorsHeaders(
                    buildJsonResponse(401, {
                        code: "UNAUTHORIZED",
                        message: "Missing or invalid Authorization bearer token",
                    }),
                    getHeader(event, "origin")
                );
                logger.end("app.handler", { method, path, statusCode: 401 });
                return response;
            }

            const response = withCorsHeaders(
                await ordersPdfHandler(event, context),
                getHeader(event, "origin")
            );
            logger.end("app.handler", {
                method,
                path,
                statusCode: response?.statusCode || 200,
            });
            return response;
        }

        logger.warn("app.handler - Unsupported HTTP method", { method, path });
        const response = withCorsHeaders(
            buildJsonResponse(405, {
                code: "METHOD_NOT_ALLOWED",
                message: "Only POST is allowed",
            }),
            getHeader(event, "origin")
        );
        logger.end("app.handler", {
            method,
            path,
            statusCode: 405,
        });
        return response;
    });
};
