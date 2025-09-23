import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, JWTPayload } from '../utils/auth';

// Extend Express Request interface to include user data
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}

/**
 * Middleware to authenticate JWT tokens
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            res.status(401).json({
                success: false,
                error: 'Access token required',
                code: 'TOKEN_MISSING'
            });
            return;
        }

        const decoded = verifyToken(token, false);
        req.user = decoded;
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Token validation failed';

        let code = 'TOKEN_INVALID';
        if (message === 'Token expired') {
            code = 'TOKEN_EXPIRED';
        }

        res.status(401).json({
            success: false,
            error: message,
            code
        });
    }
}

/**
 * Middleware to authenticate refresh tokens
 */
export function authenticateRefreshToken(req: Request, res: Response, next: NextFunction): void {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            res.status(401).json({
                success: false,
                error: 'Refresh token required',
                code: 'REFRESH_TOKEN_MISSING'
            });
            return;
        }

        const decoded = verifyToken(token, true);
        req.user = decoded;
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Refresh token validation failed';

        let code = 'REFRESH_TOKEN_INVALID';
        if (message === 'Token expired') {
            code = 'REFRESH_TOKEN_EXPIRED';
        }

        res.status(401).json({
            success: false,
            error: message,
            code
        });
    }
}

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (token) {
            const decoded = verifyToken(token, false);
            req.user = decoded;
        }

        next();
    } catch (error) {
        // For optional auth, we continue even if token is invalid
        next();
    }
}