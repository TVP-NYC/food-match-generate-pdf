import express from "express";
import { handler } from "./app.js";
import { createLogger } from "./src/utils/logger.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const serverLogger = createLogger({ scope: "local-server" });

app.use(express.json({ limit: "2mb" }));

function createLambdaContext() {
    return {
        awsRequestId: `local-http-${Date.now()}`,
        functionName: "food-match-generate-pdf-local-http",
        functionVersion: "$LATEST",
        invokedFunctionArn: "arn:aws:lambda:local:0:function:food-match-generate-pdf-local-http",
        memoryLimitInMB: "256",
    };
}

async function runLambdaFromRequest(req) {
    const event = {
        httpMethod: req.method,
        path: req.path,
        headers: req.headers,
        queryStringParameters: req.query,
        isBase64Encoded: false,
        body: req.body ? JSON.stringify(req.body) : "",
    };

    const context = createLambdaContext();
    return handler(event, context);
}

app.get("/health", (_req, res) => {
    serverLogger.info("server.health - Health check OK", { statusCode: 200 });
    res.status(200).json({ ok: true, service: "food-match-generate-pdf" });
});

app.options("/generate-pdf", async (req, res) => {
    const logger = createLogger({ scope: "local-server" });
    logger.start("server.request", { method: req.method, path: req.path });

    try {
        const lambdaResponse = await runLambdaFromRequest(req);
        if (lambdaResponse.headers) {
            for (const [key, value] of Object.entries(lambdaResponse.headers)) {
                res.setHeader(key, value);
            }
        }

        const statusCode = lambdaResponse.statusCode || 204;
        logger.end("server.request", {
            method: req.method,
            path: req.path,
            statusCode,
        });
        res.status(statusCode).send(lambdaResponse.body || "");
    } catch (error) {
        logger.error("server.request - Request failed", {
            method: req.method,
            path: req.path,
            message: error && error.message ? error.message : "Unexpected local server error",
        });
        logger.end("server.request", {
            method: req.method,
            path: req.path,
            statusCode: 500,
        });
        res.status(500).json({
            code: "LOCAL_SERVER_ERROR",
            message: error && error.message ? error.message : "Unexpected local server error",
        });
    }
});

app.post("/generate-pdf", async (req, res) => {
    const logger = createLogger({ scope: "local-server" });
    logger.start("server.request", { method: req.method, path: req.path });

    try {
        const lambdaResponse = await runLambdaFromRequest(req);

        if (lambdaResponse.headers) {
            for (const [key, value] of Object.entries(lambdaResponse.headers)) {
                res.setHeader(key, value);
            }
        }

        const responseMode = String(req.headers["x-pdf-response-mode"] || "").toLowerCase();

        if (lambdaResponse.isBase64Encoded && responseMode === "base64-json") {
            const statusCode = lambdaResponse.statusCode || 200;
            logger.end("server.request", {
                method: req.method,
                path: req.path,
                statusCode,
                mode: "base64-json",
            });
            res.status(statusCode).json(lambdaResponse);
            return;
        }

        const statusCode = lambdaResponse.statusCode || 200;
        if (lambdaResponse.isBase64Encoded) {
            const buffer = Buffer.from(lambdaResponse.body || "", "base64");
            logger.end("server.request", {
                method: req.method,
                path: req.path,
                statusCode,
                bytes: buffer.length,
            });
            res.status(statusCode).send(buffer);
            return;
        }

        const contentType = (lambdaResponse.headers && (lambdaResponse.headers["Content-Type"] || lambdaResponse.headers["content-type"])) || "application/json";
        if (contentType.includes("application/json") && typeof lambdaResponse.body === "string") {
            logger.end("server.request", {
                method: req.method,
                path: req.path,
                statusCode,
            });
            res.status(statusCode).send(lambdaResponse.body);
            return;
        }

        logger.end("server.request", {
            method: req.method,
            path: req.path,
            statusCode,
        });
        res.status(statusCode).send(lambdaResponse.body || "");
    } catch (error) {
        logger.error("server.request - Request failed", {
            method: req.method,
            path: req.path,
            message: error && error.message ? error.message : "Unexpected local server error",
        });
        logger.end("server.request", {
            method: req.method,
            path: req.path,
            statusCode: 500,
        });
        res.status(500).json({
            code: "LOCAL_SERVER_ERROR",
            message: error && error.message ? error.message : "Unexpected local server error",
        });
    }
});

app.listen(port, () => {
    serverLogger.info("server - Started", { port, url: `http://localhost:${port}` });
});
