import {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
    generateTokenPair,
    verifyToken,
    extractTokenFromHeader
} from './auth';

// Mock the config
jest.mock('../config/environment', () => ({
    config: {
        jwt: {
            secret: 'test-secret',
            refreshSecret: 'test-refresh-secret'
        }
    }
}));

describe('Auth Utils', () => {
    const testUserId = 'test-user-id';
    const testUsername = 'testuser';

    describe('Password hashing', () => {
        it('should hash password correctly', async () => {
            const password = 'testpassword123';
            const hash = await hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(50);
        });

        it('should verify password correctly', async () => {
            const password = 'testpassword123';
            const hash = await hashPassword(password);

            const isValid = await verifyPassword(password, hash);
            expect(isValid).toBe(true);

            const isInvalid = await verifyPassword('wrongpassword', hash);
            expect(isInvalid).toBe(false);
        });
    });

    describe('Token generation', () => {
        it('should generate access token', () => {
            const token = generateAccessToken(testUserId, testUsername);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
        });

        it('should generate refresh token', () => {
            const token = generateRefreshToken(testUserId, testUsername);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3);
        });

        it('should generate token pair', () => {
            const tokens = generateTokenPair(testUserId, testUsername);

            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
            expect(tokens.accessToken).not.toBe(tokens.refreshToken);
        });
    });

    describe('Token verification', () => {
        it('should verify access token correctly', () => {
            const token = generateAccessToken(testUserId, testUsername);
            const decoded = verifyToken(token, false);

            expect(decoded.userId).toBe(testUserId);
            expect(decoded.username).toBe(testUsername);
            expect(decoded.type).toBe('access');
        });

        it('should verify refresh token correctly', () => {
            const token = generateRefreshToken(testUserId, testUsername);
            const decoded = verifyToken(token, true);

            expect(decoded.userId).toBe(testUserId);
            expect(decoded.username).toBe(testUsername);
            expect(decoded.type).toBe('refresh');
        });

        it('should throw error for invalid token', () => {
            expect(() => {
                verifyToken('invalid-token', false);
            }).toThrow('Invalid token');
        });

        it('should throw error for wrong token type', () => {
            const accessToken = generateAccessToken(testUserId, testUsername);

            expect(() => {
                verifyToken(accessToken, true); // Trying to verify access token as refresh
            }).toThrow(); // JWT will throw an error due to different secrets
        });
    });

    describe('Token extraction', () => {
        it('should extract token from Bearer header', () => {
            const token = 'test-token-123';
            const header = `Bearer ${token}`;

            const extracted = extractTokenFromHeader(header);
            expect(extracted).toBe(token);
        });

        it('should return null for invalid header format', () => {
            expect(extractTokenFromHeader('InvalidFormat token')).toBeNull();
            expect(extractTokenFromHeader('Bearer')).toBeNull();
            expect(extractTokenFromHeader('Bearer token extra')).toBeNull();
            expect(extractTokenFromHeader('')).toBeNull();
            expect(extractTokenFromHeader(undefined)).toBeNull();
        });
    });
});