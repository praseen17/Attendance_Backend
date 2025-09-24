import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export interface JWTPayload {
    userId: string;
    username: string;
    type: 'access' | 'refresh';
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(userId: string, username: string): string {
    const payload: JWTPayload = {
        userId,
        username,
        type: 'access'
    };

    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'attendance-system',
        audience: 'attendance-app'
    });
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId: string, username: string): string {
    const payload: JWTPayload = {
        userId,
        username,
        type: 'refresh'
    };

    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'attendance-system',
        audience: 'attendance-app'
    });
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(userId: string, username: string): TokenPair {
    return {
        accessToken: generateAccessToken(userId, username),
        refreshToken: generateRefreshToken(userId, username)
    };
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string, isRefreshToken = false): JWTPayload {
    const secret = isRefreshToken ? config.jwt.refreshSecret : config.jwt.secret;

    try {
        const decoded = jwt.verify(token, secret, {
            issuer: 'attendance-system',
            audience: 'attendance-app'
        }) as JWTPayload;

        // Verify token type matches expectation
        const expectedType = isRefreshToken ? 'refresh' : 'access';
        if (decoded.type !== expectedType) {
            throw new Error(`Invalid token type. Expected ${expectedType}, got ${decoded.type}`);
        }

        return decoded;
    } catch (error) {
        // Handle our custom token type error first
        if (error instanceof Error && error.message.includes('Invalid token type')) {
            throw error;
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Token expired');
        }
        throw error;
    }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
}