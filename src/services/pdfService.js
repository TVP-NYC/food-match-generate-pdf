import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { InternalError } from "../utils/errors.js";

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const COLUMN_GAP = 44;
const ROWS_PER_PAGE = 7;
const COLUMNS_PER_PAGE = 2;
const ROW_GAP = 10;
const CARD_HEIGHT = (PAGE_HEIGHT - PAGE_MARGIN * 2 - ROW_GAP * (ROWS_PER_PAGE - 1)) / ROWS_PER_PAGE;
const LOGO_AREA_HEIGHT = 16;
const FOOTER_NOTE = "Sample was prepared in a facility that contains milk, nuts, soy & wheat";

const HEADER_FONT_SIZE = 7;
const TITLE_FONT_SIZE = 12;
const BODY_FONT_SIZE = 8;
const SMALL_FONT_SIZE = 7;
const TITLE_LINE_SPACING = 8;
const WARNING_LINE_SPACING = 9;
const BRAND_LEFT = "FOOD";
const BRAND_RIGHT = "Match";
const COMPANY_LOGO_PATH = process.env.COMPANY_LOGO_PATH || "assets/company-logo.png";

const CARD_WIDTH = ((PAGE_WIDTH - PAGE_MARGIN * 2 - COLUMN_GAP) / COLUMNS_PER_PAGE) * 0.65;
const INTERNAL_PADDING = 10;

function formatDate(input) {
    const value = new Date(input);
    if (Number.isNaN(value.getTime())) {
        return "N/A";
    }
    return `${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}/${value.getFullYear()}`;
}

function getLineItemsByOrder(orders) {
    const today = formatDate(new Date());
    const allLineItems = [];
    for (const order of orders) {
        for (const item of order.lineItems) {
            allLineItems.push({
                ...item,
                orderId: order.id,
                orderName: order.name,
                printDate: today,
            });
        }
    }
    return allLineItems;
}

function fitText(text, font, size, maxWidth) {
    const sanitized = sanitizeTextForPdf(text);
    if (!sanitized) {
        return "";
    }

    let output = sanitized;
    while (font.widthOfTextAtSize(output, size) > maxWidth && output.length > 1) {
        output = `${output.slice(0, -2)}…`;
    }
    return output;
}

function drawCenteredText(page, text, font, size, centerX, y, color = rgb(0, 0, 0)) {
    const sanitized = sanitizeTextForPdf(text);
    if (!sanitized) {
        return;
    }

    const textWidth = font.widthOfTextAtSize(sanitized, size);
    page.drawText(sanitized, {
        x: centerX - textWidth / 2,
        y,
        size,
        font,
        color,
    });
}

function splitCenteredLines(text, font, size, maxWidth, maxLines = Number.POSITIVE_INFINITY) {
    const sanitized = sanitizeTextForPdf(text);
    if (!sanitized) {
        return [];
    }

    const words = sanitized.split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate;
            continue;
        }

        if (current) {
            lines.push(current);
            current = word;
        } else {
            lines.push(fitText(word, font, size, maxWidth));
        }
    }

    if (current) {
        lines.push(current);
    }

    if (lines.length <= maxLines) {
        return lines;
    }

    const preservedLines = lines.slice(0, Math.max(maxLines - 1, 0));
    const overflowText = lines.slice(Math.max(maxLines - 1, 0)).join(" ");

    if (maxLines > 0) {
        preservedLines.push(fitText(overflowText, font, size, maxWidth));
    }

    return preservedLines;
}

function sanitizeTextForPdf(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[\u0100-\uFFFF]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

async function getEmbeddedLogo(pdfDoc) {
    if (!COMPANY_LOGO_PATH) {
        return null;
    }

    try {
        const absolutePath = path.isAbsolute(COMPANY_LOGO_PATH)
            ? COMPANY_LOGO_PATH
            : path.join(process.cwd(), COMPANY_LOGO_PATH);
        const bytes = await readFile(absolutePath);
        const lowerCasePath = COMPANY_LOGO_PATH.toLowerCase();

        if (lowerCasePath.endsWith(".png")) {
            return await pdfDoc.embedPng(bytes);
        }
        return await pdfDoc.embedJpg(bytes);
    } catch (error) {
        return null;
    }
}

function drawBrandFallback(page, centerX, y, boldFont) {
    drawCenteredText(page, BRAND_LEFT, boldFont, TITLE_FONT_SIZE + 1, centerX - 20, y, rgb(0.32, 0.26, 0.4));
    drawCenteredText(page, BRAND_RIGHT, boldFont, TITLE_FONT_SIZE + 1, centerX + 28, y, rgb(0.62, 0.72, 0.1));
}

function drawCompanyLogo(page, logoImage, x, topY, centerX, boldFont) {
    if (!logoImage) {
        drawBrandFallback(page, centerX, topY - 40, boldFont);
        return;
    }

    const logoBoxWidth = CARD_WIDTH - INTERNAL_PADDING * 2;
    const logoBoxHeight = LOGO_AREA_HEIGHT;
    const widthScale = logoBoxWidth / logoImage.width;
    const heightScale = logoBoxHeight / logoImage.height;
    const scale = Math.min(widthScale, heightScale) * 0.60;

    const drawWidth = logoImage.width * scale;
    const drawHeight = logoImage.height * scale;
    const drawX = x + INTERNAL_PADDING + (logoBoxWidth - drawWidth) / 2;
    const drawY = topY - 10 - drawHeight;

    page.drawImage(logoImage, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
    });
}

function drawProductCard(page, lineItem, layout, fonts, logoImage) {
    const { x, y } = layout;
    const { regularFont, boldFont } = fonts;
    const cardTopY = y;
    const centerX = x + CARD_WIDTH / 2;

    drawCompanyLogo(page, logoImage, x, cardTopY, centerX, boldFont);

    const TEXT_PADDING = 6;
    const maxTextWidth = CARD_WIDTH - TEXT_PADDING * 2;
    const title = `${lineItem.sku || "NO-SKU"} ${lineItem.productTitle || lineItem.title || "Untitled Product"}`.trim();
    const titleLines = splitCenteredLines(title, regularFont, HEADER_FONT_SIZE, maxTextWidth, 2);
    const sampleLine = fitText(`Sample size: ${lineItem.variantName || "N/A"}`, regularFont, BODY_FONT_SIZE, maxTextWidth);
    const packedLine = fitText(`Packed: ${lineItem.printDate}`, regularFont, BODY_FONT_SIZE, maxTextWidth);
    const warningLines = splitCenteredLines(FOOTER_NOTE, regularFont, SMALL_FONT_SIZE, maxTextWidth);

    const contentStartY = cardTopY - LOGO_AREA_HEIGHT - 14;
    const titleBlockHeight = Math.max(titleLines.length - 1, 0) * TITLE_LINE_SPACING;
    const sampleY = contentStartY - titleBlockHeight - 10;
    const packedY = sampleY - 10;
    const warningY = packedY - 8;

    for (const [index, line] of titleLines.entries()) {
        drawCenteredText(page, line, regularFont, HEADER_FONT_SIZE, centerX, contentStartY - index * TITLE_LINE_SPACING);
    }
    drawCenteredText(page, sampleLine, regularFont, BODY_FONT_SIZE, centerX, sampleY);
    drawCenteredText(page, packedLine, regularFont, BODY_FONT_SIZE, centerX, packedY);
    drawCenteredText(page, warningLines[0] || "", regularFont, SMALL_FONT_SIZE, centerX, warningY);
    if (warningLines[1]) {
        drawCenteredText(page, warningLines[1], regularFont, SMALL_FONT_SIZE, centerX, warningY - WARNING_LINE_SPACING);
    }
}

async function buildOrdersPdf(orders) {
    try {
        const pdfDoc = await PDFDocument.create();
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fonts = { regularFont, boldFont };
        const logoImage = await getEmbeddedLogo(pdfDoc);

        const allLineItems = getLineItemsByOrder(orders);
        if (allLineItems.length === 0) {
            pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            return await pdfDoc.save();
        }

        let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        let rowY = PAGE_HEIGHT - PAGE_MARGIN;
        let columnIndex = 0;
        let rowCount = 0;
        const columnWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - COLUMN_GAP) / COLUMNS_PER_PAGE;

        for (const item of allLineItems) {
            // If there is not enough space for another row, start a new page before drawing.
            if (columnIndex === 0 && rowY - CARD_HEIGHT < PAGE_MARGIN) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                rowY = PAGE_HEIGHT - PAGE_MARGIN;
                columnIndex = 0;
                rowCount = 0;
            }

            const columnX = columnIndex === 0 ? PAGE_MARGIN : PAGE_MARGIN + columnWidth + COLUMN_GAP;
            const x = columnX + (columnWidth - CARD_WIDTH) / 2;

            drawProductCard(page, item, { x, y: rowY }, fonts, logoImage);

            if (columnIndex === 0) {
                columnIndex = 1;
            } else {
                columnIndex = 0;
                rowCount++;

                rowY -= CARD_HEIGHT + ROW_GAP;

                if (rowCount >= ROWS_PER_PAGE) {
                    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                    rowY = PAGE_HEIGHT - PAGE_MARGIN;
                    columnIndex = 0;
                    rowCount = 0;
                }
            }
        }

        return await pdfDoc.save();
    } catch (error) {
        console.error("PDF generation failed", {
            message: error && error.message ? error.message : "unknown-pdf-error",
        });
        throw new InternalError("Failed to generate PDF", "PDF_GENERATION_ERROR", {
            reason: error && error.message ? error.message : "unknown-pdf-error",
        });
    }
}

export {
    buildOrdersPdf,
};
