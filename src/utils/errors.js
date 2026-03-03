class AppError extends Error {
    constructor(message, code, details) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
    }
}

class ValidationError extends AppError {
    constructor(message, code = "VALIDATIsON_ERROR", details) {
        super(message, code, details);
    }
}

class NotFoundError extends AppError {
    constructor(message, code = "NOT_FOUND", details) {
        super(message, code, details);
    }
}

class InternalError extends AppError {
    constructor(message = "Internal server error", code = "INTERNAL_ERROR", details) {
        super(message, code, details);
    }
}

export {
    AppError,
    ValidationError,
    NotFoundError,
    InternalError,
};
