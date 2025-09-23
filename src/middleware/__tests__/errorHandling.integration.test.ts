import request from 'supertest';
import express from 'express';
import { comprehensiveErrorHandler, createEnhancedError, suspiciousActivityDetector } from '../comprehensiveErrorHandler';

describe('Error Handling Integration', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Add suspicious activity detector
        app.use(suspiciousActivityDetector);

        // Test routes
        app.get('/test/error/:code', (req, res, next) => {
            const code = parseInt(req.params.code);
            const error = createEnhancedError(`Test error ${code}`, code, 'VALIDATION');
            next(error);
        });

        app.post('/test/suspicious', (req, res) => {
            res.json({ success: true, message: 'Request processed' });
        });

        // Add error handler
        app.use(comprehensiveErrorHandler);
    });

    describe('Error Response Format', () => {
        it('should return structured error response for 400 error', async () => {
            const response = await request(app)
                .get('/test/error/400')
                .expect(400);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 400,
                    type: 'VALIDATION_ERROR',
                    category: 'VALIDATION',
                    message: expect.any(String),
                    isRecoverable: true,
                    suggestedActions: expect.any(Array),
                    timestamp: expect.any(String)
                }
            });
        });

        it('should return structured error response for 500 error', async () => {
            const response = await request(app)
                .get('/test/error/500')
                .expect(500);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 500,
                    type: 'INTERNAL_SERVER_ERROR',
                    category: 'VALIDATION',
                    message: expect.any(String),
                    isRecoverable: true,
                    suggestedActions: expect.any(Array)
                }
            });
        });

        it('should return structured error response for 401 error', async () => {
            const response = await request(app)
                .get('/test/error/401')
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 401,
                    type: 'AUTHENTICATION_ERROR',
                    category: 'VALIDATION',
                    message: expect.any(String),
                    isRecoverable: true,
                    suggestedActions: expect.any(Array)
                }
            });
        });
    });

    describe('Suspicious Activity Detection', () => {
        it('should block SQL injection attempts', async () => {
            const response = await request(app)
                .post('/test/suspicious')
                .send({ query: "'; DROP TABLE users; --" })
                .expect(403);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 403,
                    type: 'AUTHORIZATION_ERROR',
                    category: 'SECURITY',
                    message: expect.stringContaining('Access denied')
                }
            });
        });

        it('should block XSS attempts', async () => {
            const response = await request(app)
                .post('/test/suspicious')
                .send({ content: '<script>alert("xss")</script>' })
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.category).toBe('SECURITY');
        });

        it('should allow legitimate requests', async () => {
            const response = await request(app)
                .post('/test/suspicious')
                .send({ name: 'John Doe', email: 'john@example.com' })
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                message: 'Request processed'
            });
        });
    });

    describe('User-Friendly Messages', () => {
        it('should provide user-friendly message for validation errors', async () => {
            const response = await request(app)
                .get('/test/error/422')
                .expect(422);

            expect(response.body.error.message).toContain('required fields');
        });

        it('should provide suggested actions for errors', async () => {
            const response = await request(app)
                .get('/test/error/400')
                .expect(400);

            expect(response.body.error.suggestedActions).toContain('Check your input data');
        });

        it('should indicate if error is recoverable', async () => {
            const response = await request(app)
                .get('/test/error/500')
                .expect(500);

            expect(response.body.error.isRecoverable).toBe(true);
        });
    });
});