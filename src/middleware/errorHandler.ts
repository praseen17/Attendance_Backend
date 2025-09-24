import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export const errorHandler = (
    error: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // Log error for debugging
    console.error(`Error ${statusCode}: ${message}`);
    console.error(error.stack);

    // Detect if request is from React Native
    const userAgent = req.get('User-Agent') || '';
    const isReactNative = userAgent.includes('ReactNative') ||
        userAgent.includes('okhttp') ||
        req.get('X-React-Native') === 'true';

    // Mobile-specific error response format
    if (isReactNative) {
        res.status(statusCode).json({
            success: false,
            error: {
                code: statusCode,
                message,
                type: getErrorType(statusCode),
                timestamp: new Date().toISOString(),
                ...(process.env.NODE_ENV === 'development' && {
                    stack: error.stack,
                    path: req.path,
                    method: req.method
                })
            }
        });
    } else {
        // Standard web error response
        res.status(statusCode).json({
            success: false,
            error: {
                message,
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            }
        });
    }
};

// Helper function to categorize error types for mobile clients
const getErrorType = (statusCode: number): string => {
    if (statusCode >= 400 && statusCode < 500) {
        switch (statusCode) {
            case 400: return 'VALIDATION_ERROR';
            case 401: return 'AUTHENTICATION_ERROR';
            case 403: return 'AUTHORIZATION_ERROR';
            case 404: return 'NOT_FOUND_ERROR';
            case 409: return 'CONFLICT_ERROR';
            case 422: return 'VALIDATION_ERROR';
            case 429: return 'RATE_LIMIT_ERROR';
            default: return 'CLIENT_ERROR';
        }
    } else if (statusCode >= 500) {
        switch (statusCode) {
            case 500: return 'INTERNAL_SERVER_ERROR';
            case 502: return 'BAD_GATEWAY_ERROR';
            case 503: return 'SERVICE_UNAVAILABLE_ERROR';
            case 504: return 'GATEWAY_TIMEOUT_ERROR';
            default: return 'SERVER_ERROR';
        }
    }
    return 'UNKNOWN_ERROR';
};

export const createError = (message: string, statusCode: number = 500): AppError => {
    const error: AppError = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};