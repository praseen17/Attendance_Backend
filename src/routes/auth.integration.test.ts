import request from 'supertest';
import express from 'express';
import authRoutes from './auth';

// Simple integration test without complex mocking
describe('Auth Routes Integration', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/auth', authRoutes);
    });

    describe('POST /auth/login', () => {
        it('should return 400 for missing credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 'testuser'
                    // missing password
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('MISSING_CREDENTIALS');
        });

        it('should return 400 for invalid credential types', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 123,
                    password: 'password'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INVALID_CREDENTIALS_TYPE');
        });
    });

    describe('POST /auth/refresh', () => {
        it('should return 401 for missing refresh token', async () => {
            const response = await request(app)
                .post('/auth/refresh');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('REFRESH_TOKEN_MISSING');
        });
    });

    describe('GET /auth/profile', () => {
        it('should return 401 for missing access token', async () => {
            const response = await request(app)
                .get('/auth/profile');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('TOKEN_MISSING');
        });
    });

    describe('POST /auth/verify', () => {
        it('should return 401 for missing access token', async () => {
            const response = await request(app)
                .post('/auth/verify');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('TOKEN_MISSING');
        });
    });

    describe('POST /auth/logout', () => {
        it('should return 401 for missing access token', async () => {
            const response = await request(app)
                .post('/auth/logout');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('TOKEN_MISSING');
        });
    });
});