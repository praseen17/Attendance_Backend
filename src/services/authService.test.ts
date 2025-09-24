import { AuthService } from './authService';
import { getPool } from '../database/connection';

// Mock the database connection
jest.mock('../database/connection');
const mockGetPool = getPool as jest.MockedFunction<typeof getPool>;

// Mock bcrypt
jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn()
}));

const bcrypt = require('bcrypt');

describe('AuthService', () => {
    let authService: AuthService;
    let mockPool: any;

    beforeEach(() => {
        mockPool = {
            query: jest.fn()
        };
        mockGetPool.mockReturnValue(mockPool);
        authService = new AuthService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('login', () => {
        const mockFaculty = {
            id: 'test-id',
            username: 'testuser',
            password_hash: '$2b$12$hashedpassword',
            name: 'Test User',
            email: 'test@example.com',
            is_active: true,
            created_at: new Date()
        };

        it('should login successfully with valid credentials', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [mockFaculty]
            });

            // Mock bcrypt.compare to return true
            bcrypt.compare.mockResolvedValueOnce(true);

            const result = await authService.login({
                username: 'testuser',
                password: 'correctpassword'
            });

            expect(result.success).toBe(true);
            expect(result.user).toBeDefined();
            expect(result.tokens).toBeDefined();
            expect(result.user?.username).toBe('testuser');
        });

        it('should fail login with invalid username', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: []
            });

            const result = await authService.login({
                username: 'nonexistent',
                password: 'password'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid username or password');
        });

        it('should handle database errors gracefully', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Database error'));

            const result = await authService.login({
                username: 'testuser',
                password: 'password'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Authentication failed');
        });
    });

    describe('getUserProfile', () => {
        it('should return user profile for valid user ID', async () => {
            const mockFaculty = {
                id: 'test-id',
                username: 'testuser',
                name: 'Test User',
                email: 'test@example.com',
                is_active: true,
                created_at: new Date()
            };

            mockPool.query.mockResolvedValueOnce({
                rows: [mockFaculty]
            });

            const profile = await authService.getUserProfile('test-id');

            expect(profile).toBeDefined();
            expect(profile?.username).toBe('testuser');
            expect(profile?.isActive).toBe(true);
        });

        it('should return null for non-existent user', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: []
            });

            const profile = await authService.getUserProfile('non-existent');

            expect(profile).toBeNull();
        });
    });

    describe('usernameExists', () => {
        it('should return true if username exists', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 'test-id' }]
            });

            const exists = await authService.usernameExists('testuser');

            expect(exists).toBe(true);
        });

        it('should return false if username does not exist', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: []
            });

            const exists = await authService.usernameExists('nonexistent');

            expect(exists).toBe(false);
        });
    });
});