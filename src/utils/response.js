function buildJsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify(body),
    };
}

function buildPdfResponse(pdfBytes, fileName) {
    return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Cache-Control": "no-store",
        },
        body: Buffer.from(pdfBytes).toString("base64"),
    };
}

export {
    buildJsonResponse,
    buildPdfResponse,
};
