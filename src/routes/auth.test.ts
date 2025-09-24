import request from 'supertest';
import express from 'express';
import authRoutes from './auth';

// Mock the AuthService
jest.mock('../services/authService', () => {
    const mockLogin = jest.fn();
    const mockGetUserProfile = jest.fn();

    return {
        AuthService: jest.fn().mockImplementation(() => ({
            login: mockLogin,
            getUserProfile: mockGetUserProfile,
            createFaculty: jest.fn(),
            usernameExists: jest.fn(),
            updatePassword: jest.fn()
        })),
        mockLogin,
        mockGetUserProfile
    };
});

import { mockLogin, mockGetUserProfile } from '../services/authService';

// Mock the auth middleware
jest.mock('../middleware/auth', () => ({
    authenticateToken: (req: any, res: any, next: any) => {
        req.user = { userId: 'test-id', username: 'testuser', type: 'access' };
        next();
    },
    authenticateRefreshToken: (req: any, res: any, next: any) => {
        req.user = { userId: 'test-id', username: 'testuser', type: 'refresh' };
        next();
    }
}));

// Mock the auth utilities
jest.mock('../utils/auth', () => ({
    generateTokenPair: jest.fn(() => ({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
    })),
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
    verifyToken: jest.fn(),
    extractTokenFromHeader: jest.fn()
}));

describe('Auth Routes', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/auth', authRoutes);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            const mockLoginResult = {
                success: true,
                user: {
                    id: 'test-id',
                    username: 'testuser',
                    name: 'Test User',
                    email: 'test@example.com'
                },
                tokens: {
                    accessToken: 'mock-access-token',
                    refreshToken: 'mock-refresh-token'
                }
            };

            mockLogin.mockResolvedValueOnce(mockLoginResult);

            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user.username).toBe('testuser');
            expect(response.body.data.accessToken).toBe('mock-access-token');
        });

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

        it('should return 401 for invalid credentials', async () => {
            const mockLoginResult = {
                success: false,
                error: 'Invalid username or password'
            };

            mockLogin.mockResolvedValueOnce(mockLoginResult);

            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 'testuser',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('LOGIN_FAILED');
        });
    });

    describe('POST /auth/refresh', () => {
        it('should refresh token successfully', async () => {
            const mockUserProfile = {
                id: 'test-id',
                username: 'testuser',
                name: 'Test User',
                email: 'test@example.com',
                isActive: true,
                createdAt: new Date()
            };

            mockGetUserProfile.mockResolvedValueOnce(mockUserProfile);

            const response = await request(app)
                .post('/auth/refresh')
                .set('Authorization', 'Bearer mock-refresh-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.accessToken).toBeDefined();
            expect(response.body.data.refreshToken).toBeDefined();
        });
    });

    describe('GET /auth/profile', () => {
        it('should return user profile', async () => {
            const mockUserProfile = {
                id: 'test-id',
                username: 'testuser',
                name: 'Test User',
                email: 'test@example.com',
                isActive: true,
                createdAt: new Date()
            };

            mockGetUserProfile.mockResolvedValueOnce(mockUserProfile);

            const response = await request(app)
                .get('/auth/profile')
                .set('Authorization', 'Bearer mock-access-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user.username).toBe('testuser');
        });
    });

    describe('POST /auth/verify', () => {
        it('should verify token successfully', async () => {
            const response = await request(app)
                .post('/auth/verify')
                .set('Authorization', 'Bearer mock-access-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.valid).toBe(true);
        });
    });

    describe('POST /auth/logout', () => {
        it('should logout successfully', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', 'Bearer mock-access-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });
});