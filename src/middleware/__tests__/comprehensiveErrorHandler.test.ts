import { Request, Response, NextFunction } from 'express';
import {
    comprehensiveErrorHandler,
    createEnhancedError,
    suspiciousActivityDetector,
    rateLimitWithLogging,
    securityEventLogger,
    AppError,
    SecurityEvent
} from '../comprehensiveErrorHandler';

describe('ComprehensiveErrorHandler', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockRequest = {
            method: 'POST',
            path: '/api/test',
            get: jest.fn(),
            connection: { remoteAddress: '127.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
            headers: {},
            body: {},
            query: {},
            params: {}
        };

        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis()
        };

        mockNext = jest.fn();

        // Clear console mocks
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Error Handler Middleware', () => {
        it('should handle basic errors with user-friendly messages', () => {
            const error = createEnhancedError('Test error', 400, 'VALIDATION');

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 400,
                        message: 'Invalid request data. Please check your input and try again.',
                        type: 'VALIDATION_ERROR',
                        category: 'VALIDATION',
                        isRecoverable: true,
                        suggestedActions: expect.arrayContaining([
                            'Check your input data',
                            'Ensure all required fields are filled'
                        ])
                    })
                })
            );
        });

        it('should detect React Native requests and format response accordingly', () => {
            (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
                if (header === 'User-Agent') return 'ReactNative/0.64.0';
                return undefined;
            });

            const error = createEnhancedError('Test error', 500);

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 500,
                        type: 'INTERNAL_SERVER_ERROR',
                        timestamp: expect.any(String),
                        isRecoverable: true,
                        suggestedActions: expect.any(Array)
                    })
                })
            );
        });

        it('should log security events for authentication errors', () => {
            const error = createEnhancedError('Unauthorized access', 401, 'AUTHENTICATION', true);
            (mockRequest as any).user = { id: 'user123' };

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(console.warn).toHaveBeenCalledWith(
                'SECURITY EVENT:',
                expect.objectContaining({
                    type: 'UNAUTHORIZED_ACCESS',
                    severity: 'HIGH',
                    userId: 'user123',
                    blocked: true
                })
            );
        });

        it('should include development information in development mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const error = createEnhancedError('Test error', 500);
            error.stack = 'Error stack trace';

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        originalMessage: 'Test error',
                        stack: 'Error stack trace',
                        path: '/api/test',
                        method: 'POST'
                    })
                })
            );

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('Security Event Logger', () => {
        it('should log security events with proper severity', () => {
            const event = securityEventLogger.logSecurityEvent(
                'UNAUTHORIZED_ACCESS',
                mockRequest as Request,
                { reason: 'Invalid token' },
                'user123',
                true
            );

            expect(event).toMatchObject({
                type: 'UNAUTHORIZED_ACCESS',
                severity: 'HIGH',
                userId: 'user123',
                ipAddress: '127.0.0.1',
                endpoint: '/api/test',
                method: 'POST',
                blocked: true,
                details: { reason: 'Invalid token' }
            });
        });

        it('should extract client IP from various headers', () => {
            mockRequest.headers = { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' };

            const event = securityEventLogger.logSecurityEvent(
                'SUSPICIOUS_ACTIVITY',
                mockRequest as Request,
                { pattern: 'SQL injection' }
            );

            expect(event.ipAddress).toBe('192.168.1.1');
        });

        it('should maintain event history with limits', () => {
            // Generate more events than the limit
            for (let i = 0; i < 1005; i++) {
                securityEventLogger.logSecurityEvent(
                    'RATE_LIMIT_EXCEEDED',
                    mockRequest as Request,
                    { attempt: i }
                );
            }

            const recentEvents = securityEventLogger.getRecentEvents();
            expect(recentEvents.length).toBeLessThanOrEqual(1000);
        });

        it('should filter events by type', () => {
            securityEventLogger.logSecurityEvent(
                'UNAUTHORIZED_ACCESS',
                mockRequest as Request,
                { test: 1 }
            );
            securityEventLogger.logSecurityEvent(
                'SUSPICIOUS_ACTIVITY',
                mockRequest as Request,
                { test: 2 }
            );

            const unauthorizedEvents = securityEventLogger.getEventsByType('UNAUTHORIZED_ACCESS');
            const suspiciousEvents = securityEventLogger.getEventsByType('SUSPICIOUS_ACTIVITY');

            expect(unauthorizedEvents.length).toBeGreaterThan(0);
            expect(suspiciousEvents.length).toBeGreaterThan(0);
            expect(unauthorizedEvents[0].type).toBe('UNAUTHORIZED_ACCESS');
            expect(suspiciousEvents[0].type).toBe('SUSPICIOUS_ACTIVITY');
        });

        it('should filter events by severity', () => {
            securityEventLogger.logSecurityEvent(
                'DATA_BREACH_ATTEMPT',
                mockRequest as Request,
                { severity: 'critical' }
            );

            const criticalEvents = securityEventLogger.getEventsBySeverity('CRITICAL');
            expect(criticalEvents.length).toBeGreaterThan(0);
            expect(criticalEvents[0].severity).toBe('CRITICAL');
        });
    });

    describe('Suspicious Activity Detector', () => {
        it('should detect SQL injection patterns', () => {
            mockRequest.body = { query: "'; DROP TABLE users; --" };

            suspiciousActivityDetector(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        message: 'Access denied. You don\'t have permission to perform this action.',
                        category: 'SECURITY'
                    })
                })
            );
        });

        it('should detect XSS patterns', () => {
            mockRequest.query = { search: '<script>alert("xss")</script>' };

            suspiciousActivityDetector(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
        });

        it('should detect path traversal attempts', () => {
            mockRequest.params = { file: '../../../etc/passwd' };

            suspiciousActivityDetector(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
        });

        it('should detect admin access attempts', () => {
            mockRequest.body = { username: 'admin', password: 'password' };

            suspiciousActivityDetector(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
        });

        it('should allow legitimate requests', () => {
            mockRequest.body = { name: 'John Doe', email: 'john@example.com' };

            suspiciousActivityDetector(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });
    });

    describe('Rate Limiting with Logging', () => {
        it('should allow requests within rate limit', () => {
            const rateLimiter = rateLimitWithLogging(10, 60000); // 10 requests per minute

            for (let i = 0; i < 5; i++) {
                rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);
            }

            expect(mockNext).toHaveBeenCalledTimes(5);
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should block requests exceeding rate limit', () => {
            const rateLimiter = rateLimitWithLogging(2, 60000); // 2 requests per minute

            // First two requests should pass
            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);
            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(2);

            // Third request should be blocked
            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(429);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        message: 'Too many requests. Please wait a moment before trying again.',
                        type: 'RATE_LIMIT_ERROR'
                    })
                })
            );
        });

        it('should set rate limit headers', () => {
            const rateLimiter = rateLimitWithLogging(10, 60000);

            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.set).toHaveBeenCalledWith({
                'X-RateLimit-Limit': '10',
                'X-RateLimit-Remaining': '9',
                'X-RateLimit-Reset': expect.any(String)
            });
        });

        it('should log rate limit exceeded events', () => {
            const rateLimiter = rateLimitWithLogging(1, 60000);
            (mockRequest as any).user = { id: 'user123' };

            // First request passes
            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

            // Second request should be blocked and logged
            rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

            expect(console.warn).toHaveBeenCalledWith(
                'SECURITY EVENT:',
                expect.objectContaining({
                    type: 'RATE_LIMIT_EXCEEDED',
                    userId: 'user123',
                    blocked: true
                })
            );
        });
    });

    describe('Error Classification', () => {
        it('should classify authentication errors correctly', () => {
            const error = createEnhancedError('Invalid credentials', 401, 'AUTHENTICATION');

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        type: 'AUTHENTICATION_ERROR',
                        category: 'AUTHENTICATION',
                        message: 'Your session has expired. Please log in again.'
                    })
                })
            );
        });

        it('should classify validation errors correctly', () => {
            const error = createEnhancedError('Invalid input', 422, 'VALIDATION');

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        type: 'VALIDATION_ERROR',
                        category: 'VALIDATION',
                        message: 'Some required fields are missing or invalid.'
                    })
                })
            );
        });

        it('should classify database errors correctly', () => {
            const error = createEnhancedError('Database connection failed', 503, 'DATABASE');

            comprehensiveErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        type: 'SERVICE_UNAVAILABLE_ERROR',
                        category: 'DATABASE',
                        message: 'Database is temporarily unavailable. Please try again in a few moments.'
                    })
                })
            );
        });
    });

    describe('Recovery Guidance', () => {
        it('should identify recoverable errors', () => {
            const recoverableError = createEnhancedError('Temporary failure', 503);

            comprehensiveErrorHandler(recoverableError, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        isRecoverable: true,
                        suggestedActions: expect.arrayContaining([
                            'Try again later',
                            'Check your internet connection'
                        ])
                    })
                })
            );
        });

        it('should identify non-recoverable errors', () => {
            const nonRecoverableError = createEnhancedError('Resource not found', 404);

            comprehensiveErrorHandler(nonRecoverableError, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        isRecoverable: false,
                        suggestedActions: expect.arrayContaining([
                            'Check the URL or resource path',
                            'Refresh the page'
                        ])
                    })
                })
            );
        });

        it('should provide category-specific suggested actions', () => {
            const authError = createEnhancedError('Token expired', 401, 'AUTHENTICATION');

            comprehensiveErrorHandler(authError, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        suggestedActions: expect.arrayContaining([
                            'Log out and log in again',
                            'Clear browser cache'
                        ])
                    })
                })
            );
        });
    });

    describe('Enhanced Error Creation', () => {
        it('should create enhanced error with all properties', () => {
            const error = createEnhancedError(
                'Test error message',
                400,
                'VALIDATION',
                true
            );

            expect(error).toMatchObject({
                message: 'Test error message',
                statusCode: 400,
                isOperational: true,
                category: 'VALIDATION',
                securityEvent: true
            });
        });

        it('should create enhanced error with default values', () => {
            const error = createEnhancedError('Simple error');

            expect(error).toMatchObject({
                message: 'Simple error',
                statusCode: 500,
                isOperational: true,
                category: undefined,
                securityEvent: false
            });
        });
    });
});