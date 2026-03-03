const LOG_FORMAT = (process.env.LOG_FORMAT || "pretty").toLowerCase();
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const LEVEL_PRIORITY = {
    error: 0,
    warn: 1,
    info: 2,
};

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

function serializePretty(level, event, payload) {
    const entries = Object.entries(payload || {});
    const ordered = entries.sort(([keyA], [keyB]) => {
        if (keyA === "requestId") {
            return -1;
        }
        if (keyB === "requestId") {
            return 1;
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
        return { ...baseContext, ...payload };
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
    };
}

export {
    createLogger,
};
