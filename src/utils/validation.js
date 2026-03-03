import { ValidationError } from "./errors.js";

function parseBody(event) {
    if (!event || !event.body) {
        throw new ValidationError("Request body is required", "INVALID_INPUT");
    }

    const bodyContent = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;

    try {
        return JSON.parse(bodyContent);
    } catch (error) {
        throw new ValidationError("Request body must be valid JSON", "INVALID_JSON");
    }
}

function validateOrderIds(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new ValidationError("orderIds must be a non-empty array", "INVALID_ORDER_IDS");
    }

    const cleanedOrderIds = orderIds.map((orderId) => (typeof orderId === "string" ? orderId.trim() : orderId));
    const invalidValue = cleanedOrderIds.find((orderId) => typeof orderId !== "string" || orderId.length === 0);

    if (invalidValue !== undefined) {
        throw new ValidationError("Each orderId must be a non-empty string", "INVALID_ORDER_ID");
    }

    return cleanedOrderIds;
}

function validatePostRequest(event) {
    if (!event || event.httpMethod !== "POST") {
        throw new ValidationError("Only POST is allowed", "INVALID_METHOD");
    }

    const body = parseBody(event);
    const orderIds = validateOrderIds(body.orderIds);

    return { orderIds };
}

export {
    validatePostRequest,
};
