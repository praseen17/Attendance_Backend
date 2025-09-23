import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

/**
 * Enhanced error handler with security event logging
 * Requirements: 6.5 - Security event logging for unauthorized access attempts
 */

export interface SecurityEvent {
    id: string;
    type: 'UNAUTHORIZED_ACCESS' | 'INVALID_TOKEN' | 'SUSPICIOUS_ACTIVITY' | 'DATA_BREACH_ATTEMPT' | 'RATE_LIMIT_EXCEEDED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    timestamp: Date;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    details: Record<string, any>;
    blocked: boolean;
}

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    category?: 'VALIDATION' | 'AUTHENTICATION' | 'AUTHORIZATION' | 'DATABASE' | 'NETWORK' | 'SECURITY' | 'SYSTEM';
    securityEvent?: boolean;
}

class SecurityEventLogger {
    private securityEvents: SecurityEvent[] = [];
    private readonly MAX_EVENTS = 1000;

    /**
     * Log security event
     * Requirements: 6.5 - Security event logging
     */
    logSecurityEvent(
        type: SecurityEvent['type'],
        req: Request,
        details: Record<string, any>,
        userId?: string,
        blocked: boolean = true
    ): SecurityEvent {
        const event: SecurityEvent = {
            id: this.generateEventId(),
            type,
            severity: this.getSecurityEventSeverity(type),
            timestamp: new Date(),
            userId,
            ipAddress: this.getClientIP(req),
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            details,
            blocked
        };

        // Add to events array
        this.securityEvents.push(event);

        // Keep only recent events
        if (this.securityEvents.length > this.MAX_EVENTS) {
            this.securityEvents.shift();
        }

        // Log to console with appropriate level
        this.logToConsole(event);

        // In production, you would also log to external security monitoring system
        if (process.env.NODE_ENV === 'production') {
            this.logToExternalSystem(event);
        }

        return event;
    }

    /**
     * Get security event severity
     */
    private getSecurityEventSeverity(type: SecurityEvent['type']): SecurityEvent['severity'] {
        const severityMap: Record<SecurityEvent['type'], SecurityEvent['severity']> = {
            'UNAUTHORIZED_ACCESS': 'HIGH',
            'INVALID_TOKEN': 'MEDIUM',
            'SUSPICIOUS_ACTIVITY': 'HIGH',
            'DATA_BREACH_ATTEMPT': 'CRITICAL',
            'RATE_LIMIT_EXCEEDED': 'MEDIUM'
        };
        return severityMap[type] || 'HIGH';
    }

    /**
     * Get client IP address
     */
    private getClientIP(req: Request): string {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            'unknown';
    }

    /**
     * Log security event to console
     */
    private logToConsole(event: SecurityEvent): void {
        const logLevel = event.severity === 'CRITICAL' || event.severity === 'HIGH' ? 'error' : 'warn';

        console[logLevel]('SECURITY EVENT:', {
            id: event.id,
            type: event.type,
            severity: event.severity,
            timestamp: event.timestamp.toISOString(),
            userId: event.userId,
            ipAddress: event.ipAddress,
            endpoint: event.endpoint,
            method: event.method,
            blocked: event.blocked,
            details: event.details
        });
    }

    /**
     * Log to external security monitoring system
     * In production, this would integrate with services like Splunk, ELK, etc.
     */
    private logToExternalSystem(event: SecurityEvent): void {
        // Placeholder for external logging integration
        console.log('Would log to external security system:', event.id);
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(): string {
        return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get recent security events
     */
    getRecentEvents(limit: number = 50): SecurityEvent[] {
        return this.securityEvents.slice(-limit);
    }

    /**
     * Get events by type
     */
    getEventsByType(type: SecurityEvent['type']): SecurityEvent[] {
        return this.securityEvents.filter(event => event.type === type);
    }

    /**
     * Get events by severity
     */
    getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
        return this.securityEvents.filter(event => event.severity === severity);
    }

    /**
     * Clear old events
     */
    clearOldEvents(daysToKeep: number = 30): void {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        this.securityEvents = this.securityEvents.filter(
            event => event.timestamp > cutoffDate
        );
    }
}

// Singleton instance
const securityEventLogger = new SecurityEventLogger();

/**
 * Enhanced error handler middleware with security logging
 * Requirements: 6.5, 8.3 - Security event logging and user-friendly error messages
 */
export const comprehensiveErrorHandler = (
    error: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // Log security events for specific error types
    if (error.securityEvent || statusCode === 401 || statusCode === 403) {
        const securityEventType = getSecurityEventType(statusCode, error);
        const userId = (req as any).user?.id;

        securityEventLogger.logSecurityEvent(
            securityEventType,
            req,
            {
                errorMessage: message,
                errorCode: statusCode,
                errorCategory: error.category,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            userId,
            true
        );
    }

    // Log error for debugging
    console.error(`Error ${statusCode}: ${message}`);
    if (process.env.NODE_ENV === 'development') {
        console.error(error.stack);
    }

    // Detect if request is from React Native
    const userAgent = req.get('User-Agent') || '';
    const isReactNative = userAgent.includes('ReactNative') ||
        userAgent.includes('okhttp') ||
        req.get('X-React-Native') === 'true';

    // Enhanced error response with user-friendly messages
    const errorResponse = {
        success: false,
        error: {
            code: statusCode,
            message: getUserFriendlyMessage(statusCode, error.category, message),
            type: getErrorType(statusCode),
            category: error.category || 'SYSTEM',
            timestamp: new Date().toISOString(),
            isRecoverable: isRecoverableError(statusCode, error.category),
            suggestedActions: getSuggestedActions(statusCode, error.category),
            ...(process.env.NODE_ENV === 'development' && {
                originalMessage: message,
                stack: error.stack,
                path: req.path,
                method: req.method
            })
        }
    };

    // Mobile-specific error response format
    if (isReactNative) {
        res.status(statusCode).json(errorResponse);
    } else {
        // Standard web error response
        res.status(statusCode).json({
            success: false,
            error: {
                message: getUserFriendlyMessage(statusCode, error.category, message),
                ...(process.env.NODE_ENV === 'development' && {
                    originalMessage: message,
                    stack: error.stack
                })
            }
        });
    }
};

/**
 * Determine security event type from error
 */
function getSecurityEventType(statusCode: number, error: AppError): SecurityEvent['type'] {
    if (statusCode === 401) {
        return 'UNAUTHORIZED_ACCESS';
    }
    if (statusCode === 403) {
        return 'INVALID_TOKEN';
    }
    if (error.message?.toLowerCase().includes('suspicious')) {
        return 'SUSPICIOUS_ACTIVITY';
    }
    if (error.message?.toLowerCase().includes('breach')) {
        return 'DATA_BREACH_ATTEMPT';
    }
    if (statusCode === 429) {
        return 'RATE_LIMIT_EXCEEDED';
    }
    return 'UNAUTHORIZED_ACCESS';
}

/**
 * Get error type for categorization
 */
function getErrorType(statusCode: number): string {
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
}

/**
 * Generate user-friendly error messages
 * Requirements: 8.3 - User-friendly error messages
 */
function getUserFriendlyMessage(statusCode: number, category?: string, originalMessage?: string): string {
    const messageMap: Record<number, string> = {
        400: 'Invalid request data. Please check your input and try again.',
        401: 'Authentication required. Please log in to continue.',
        403: 'Access denied. You don\'t have permission to perform this action.',
        404: 'The requested resource was not found.',
        409: 'Data conflict detected. Please refresh and try again.',
        422: 'Invalid data provided. Please check your input.',
        429: 'Too many requests. Please wait a moment before trying again.',
        500: 'Internal server error. Please try again later.',
        502: 'Service temporarily unavailable. Please try again later.',
        503: 'Service is currently under maintenance. Please try again later.',
        504: 'Request timed out. Please try again.'
    };

    // Category-specific messages
    if (category) {
        const categoryMessages: Record<string, Record<number, string>> = {
            'AUTHENTICATION': {
                401: 'Your session has expired. Please log in again.',
                403: 'Invalid credentials. Please check your username and password.'
            },
            'DATABASE': {
                500: 'Database error occurred. Your data is safe and the issue will be resolved automatically.',
                503: 'Database is temporarily unavailable. Please try again in a few moments.'
            },
            'VALIDATION': {
                400: 'Please check your input data for errors.',
                422: 'Some required fields are missing or invalid.'
            }
        };

        if (categoryMessages[category] && categoryMessages[category][statusCode]) {
            return categoryMessages[category][statusCode];
        }
    }

    return messageMap[statusCode] || originalMessage || 'An unexpected error occurred. Please try again.';
}

/**
 * Determine if error is recoverable
 * Requirements: 8.3 - Error recovery guidance
 */
function isRecoverableError(statusCode: number, category?: string): boolean {
    // Non-recoverable errors
    const nonRecoverableErrors = [403, 404, 422];
    if (nonRecoverableErrors.includes(statusCode)) {
        return false;
    }

    // Category-specific recovery rules
    if (category === 'AUTHENTICATION' && statusCode === 401) {
        return true; // Can recover by logging in again
    }

    if (category === 'DATABASE' && statusCode >= 500) {
        return true; // Database errors are usually temporary
    }

    // Generally recoverable errors
    const recoverableErrors = [400, 401, 409, 429, 500, 502, 503, 504];
    return recoverableErrors.includes(statusCode);
}

/**
 * Get suggested actions for error resolution
 * Requirements: 8.3 - Suggested actions for error resolution
 */
function getSuggestedActions(statusCode: number, category?: string): string[] {
    const actionMap: Record<number, string[]> = {
        400: ['Check your input data', 'Ensure all required fields are filled', 'Try again with valid data'],
        401: ['Log in to your account', 'Check your credentials', 'Refresh your session'],
        403: ['Contact administrator for access', 'Check your permissions', 'Log in with appropriate account'],
        404: ['Check the URL or resource path', 'Refresh the page', 'Contact support if problem persists'],
        409: ['Refresh the page to get latest data', 'Try again after a moment', 'Check for conflicting changes'],
        422: ['Review and correct input data', 'Ensure all required fields are provided', 'Check data format requirements'],
        429: ['Wait a few moments before trying again', 'Reduce request frequency', 'Try again later'],
        500: ['Try again in a few moments', 'Refresh the page', 'Contact support if problem persists'],
        502: ['Try again later', 'Check your internet connection', 'Contact support if problem continues'],
        503: ['Wait for service to become available', 'Try again in a few minutes', 'Check service status'],
        504: ['Try again with a shorter request', 'Check your internet connection', 'Retry the operation']
    };

    // Category-specific actions
    if (category) {
        const categoryActions: Record<string, Record<number, string[]>> = {
            'AUTHENTICATION': {
                401: ['Log out and log in again', 'Clear browser cache', 'Check your credentials'],
                403: ['Contact administrator', 'Check account permissions', 'Verify account status']
            },
            'DATABASE': {
                500: ['The system will retry automatically', 'Your data is safe', 'Try again in a moment'],
                503: ['Database maintenance in progress', 'Try again shortly', 'Data will be available soon']
            }
        };

        if (categoryActions[category] && categoryActions[category][statusCode]) {
            return categoryActions[category][statusCode];
        }
    }

    return actionMap[statusCode] || ['Try again later', 'Contact support if problem persists'];
}

/**
 * Create enhanced error with category and security event flag
 */
export const createEnhancedError = (
    message: string,
    statusCode: number = 500,
    category?: AppError['category'],
    securityEvent: boolean = false
): AppError => {
    const error: AppError = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    error.category = category;
    error.securityEvent = securityEvent;
    return error;
};

/**
 * Middleware to detect and log suspicious activity
 * Requirements: 6.5 - Suspicious activity detection
 */
export const suspiciousActivityDetector = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const suspiciousPatterns = [
        /\b(union|select|insert|delete|drop|create|alter)\b/i, // SQL injection patterns
        /<script|javascript:|vbscript:|onload=|onerror=/i, // XSS patterns
        /\.\.\//g, // Path traversal
        /\b(admin|root|administrator)\b/i // Admin access attempts
    ];

    const requestData = JSON.stringify({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers
    });

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));

    if (isSuspicious) {
        const userId = (req as any).user?.id;

        securityEventLogger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            req,
            {
                suspiciousData: requestData,
                detectedPatterns: suspiciousPatterns.filter(pattern => pattern.test(requestData)).map(p => p.toString())
            },
            userId,
            true
        );

        // Block the request
        const error = createEnhancedError(
            'Suspicious activity detected',
            403,
            'SECURITY',
            true
        );

        return comprehensiveErrorHandler(error, req, res, next);
    }

    next();
};

/**
 * Rate limiting middleware with security logging
 * Requirements: 6.5 - Rate limiting with security event logging
 */
export const rateLimitWithLogging = (
    maxRequests: number = 100,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
) => {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
        const clientIP = securityEventLogger['getClientIP'](req);
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean up old entries
        for (const [ip, data] of requestCounts.entries()) {
            if (data.resetTime < windowStart) {
                requestCounts.delete(ip);
            }
        }

        // Get or create request count for this IP
        let requestData = requestCounts.get(clientIP);
        if (!requestData || requestData.resetTime < windowStart) {
            requestData = { count: 0, resetTime: now + windowMs };
            requestCounts.set(clientIP, requestData);
        }

        requestData.count++;

        if (requestData.count > maxRequests) {
            // Log rate limit exceeded
            const userId = (req as any).user?.id;

            securityEventLogger.logSecurityEvent(
                'RATE_LIMIT_EXCEEDED',
                req,
                {
                    requestCount: requestData.count,
                    maxRequests,
                    windowMs,
                    resetTime: new Date(requestData.resetTime).toISOString()
                },
                userId,
                true
            );

            const error = createEnhancedError(
                'Rate limit exceeded',
                429,
                'SECURITY',
                true
            );

            return comprehensiveErrorHandler(error, req, res, next);
        }

        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(0, maxRequests - requestData.count).toString(),
            'X-RateLimit-Reset': new Date(requestData.resetTime).toISOString()
        });

        next();
    };
};

// Export security event logger for use in other modules
export { securityEventLogger };