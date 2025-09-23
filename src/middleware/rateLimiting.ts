import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting configuration for different endpoint types
 */

/**
 * General API rate limiter - applies to all API endpoints
 */
export const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many requests from this IP, please try again later',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: '15 minutes'
        });
    }
});

/**
 * Authentication rate limiter - stricter limits for login attempts
 */
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login attempts per windowMs
    message: {
        success: false,
        error: 'Too many login attempts from this IP, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
    },
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many login attempts from this IP, please try again later',
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            retryAfter: '15 minutes'
        });
    }
});

/**
 * Sync rate limiter - for attendance sync operations
 */
export const syncRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Limit each IP to 20 sync operations per 5 minutes
    message: {
        success: false,
        error: 'Too many sync requests, please wait before trying again',
        code: 'SYNC_RATE_LIMIT_EXCEEDED',
        retryAfter: '5 minutes'
    },
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many sync requests, please wait before trying again',
            code: 'SYNC_RATE_LIMIT_EXCEEDED',
            retryAfter: '5 minutes'
        });
    }
});

/**
 * WebSocket rate limiter - for ML model requests
 */
export const websocketRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 WebSocket requests per minute
    message: {
        success: false,
        error: 'Too many WebSocket requests, please slow down',
        code: 'WEBSOCKET_RATE_LIMIT_EXCEEDED',
        retryAfter: '1 minute'
    },
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many WebSocket requests, please slow down',
            code: 'WEBSOCKET_RATE_LIMIT_EXCEEDED',
            retryAfter: '1 minute'
        });
    }
});

/**
 * Student/Section management rate limiter
 */
export const managementRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // Limit each IP to 100 management operations per 10 minutes
    message: {
        success: false,
        error: 'Too many management requests, please try again later',
        code: 'MANAGEMENT_RATE_LIMIT_EXCEEDED',
        retryAfter: '10 minutes'
    },
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many management requests, please try again later',
            code: 'MANAGEMENT_RATE_LIMIT_EXCEEDED',
            retryAfter: '10 minutes'
        });
    }
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 requests per hour
    message: {
        success: false,
        error: 'Too many requests for this sensitive operation, please try again later',
        code: 'STRICT_RATE_LIMIT_EXCEEDED',
        retryAfter: '1 hour'
    },
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: 'Too many requests for this sensitive operation, please try again later',
            code: 'STRICT_RATE_LIMIT_EXCEEDED',
            retryAfter: '1 hour'
        });
    }
});

/**
 * Create a custom rate limiter with specific configuration
 */
export function createCustomRateLimit(options: {
    windowMs: number;
    max: number;
    message: string;
    code: string;
    skipSuccessfulRequests?: boolean;
}) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        skipSuccessfulRequests: options.skipSuccessfulRequests || false,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req: Request, res: Response) => {
            res.status(429).json({
                success: false,
                error: options.message,
                code: options.code,
                retryAfter: `${Math.ceil(options.windowMs / 60000)} minutes`
            });
        }
    });
}