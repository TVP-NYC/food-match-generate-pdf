import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const LOG_FORMAT = (process.env.LOG_FORMAT || "pretty").toLowerCase();
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const LEVEL_PRIORITY = {
    error: 0,
    warn: 1,
    info: 2,
};

const TECHNICAL_KEYS = new Set([
    "scope",
    "method",
    "path",
    "seq",
    "elapsedMs",
    "port",
    "url",
    "requestId",
    "traceId",
]);

const logContextStorage = new AsyncLocalStorage();

function newTraceId() {
    return randomUUID().replace(/-/g, "");
}

function runWithLogContext(context = {}, callback) {
    const base = context && typeof context === "object" ? context : {};
    const traceId = base.traceId || base.requestId || newTraceId();

    const store = {
        context: {
            ...base,
            traceId,
        },
        sequence: 0,
        startedAt: Date.now(),
    };

    return logContextStorage.run(store, callback);
}

function shouldLog(level) {
    const configuredPriority = LEVEL_PRIORITY[LOG_LEVEL];
    const messagePriority = LEVEL_PRIORITY[level];

    const safeConfigured = configuredPriority === undefined ? LEVEL_PRIORITY.info : configuredPriority;
    const safeMessage = messagePriority === undefined ? LEVEL_PRIORITY.info : messagePriority;

    return safeMessage <= safeConfigured;
}

function serializeJson(level, event, payload) {
    return JSON.stringify({
        level,
        event,
        timestamp: new Date().toISOString(),
        ...payload,
    });
}

function formatPrimitive(value) {
    if (value === undefined || value === null) {
        return "-";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return JSON.stringify(value);
}

function sanitizePayload(payload) {
    if (!payload || typeof payload !== "object") {
        return {};
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
        if (TECHNICAL_KEYS.has(key)) {
            continue;
        }
        if (value === undefined) {
            continue;
        }
        sanitized[key] = value;
    }

    return sanitized;
}

function serializePretty(level, event, payload) {
    const entries = Object.entries(payload || {});
    const priorityKeys = ["traceId", "statusCode", "orderId", "orderCount", "code"];
    const ordered = entries.sort(([keyA], [keyB]) => {
        const indexA = priorityKeys.indexOf(keyA);
        const indexB = priorityKeys.indexOf(keyB);

        if (indexA !== -1 || indexB !== -1) {
            if (indexA === -1) {
                return 1;
            }
            if (indexB === -1) {
                return -1;
            }
            return indexA - indexB;
        }

        return keyA.localeCompare(keyB);
    });

    const context = ordered
        .map(([key, value]) => `${key}: ${formatPrimitive(value)}`)
        .join(" | ");

    return context ? `${event} | ${context}` : event;
}

function serialize(level, event, payload) {
    if (LOG_FORMAT === "json") {
        return serializeJson(level, event, payload);
    }
    return serializePretty(level, event, payload);
}

function createLogger(baseContext = {}) {
    function compose(payload) {
        const store = logContextStorage.getStore();

        if (!store) {
            return sanitizePayload({ ...baseContext, ...payload });
        }

        store.sequence += 1;

        return sanitizePayload({
            ...store.context,
            ...baseContext,
            ...payload,
        });
    }

    return {
        info(event, payload = {}) {
            if (!shouldLog("info")) {
                return;
            }
            console.info(serialize("info", event, compose(payload)));
        },
        warn(event, payload = {}) {
            if (!shouldLog("warn")) {
                return;
            }
            console.warn(serialize("warn", event, compose(payload)));
        },
        error(event, payload = {}) {
            if (!shouldLog("error")) {
                return;
            }
            console.error(serialize("error", event, compose(payload)));
        },
        start(processName, payload = {}) {
            if (!shouldLog("info")) {
                return;
            }
            console.info(serialize("info", `${processName} - Starting ${processName}`, compose(payload)));
        },
        end(processName, payload = {}) {
            if (!shouldLog("info")) {
                return;
            }
            console.info(serialize("info", `${processName} - Finished ${processName}`, compose(payload)));
        },
        child(context = {}) {
            return createLogger({ ...baseContext, ...context });
        },
    };
}

export {
    createLogger,
    runWithLogContext,
};
