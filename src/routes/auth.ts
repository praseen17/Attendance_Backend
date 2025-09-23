import { Router, Request, Response } from 'express';
import { AuthService, LoginCredentials } from '../services/authService';
import { authenticateRefreshToken, authenticateToken } from '../middleware/auth';
import { generateTokenPair, verifyToken } from '../utils/auth';
import { formatSuccessResponse, formatValidationError } from '../middleware/reactNativeCompatibility';
import { validateRequest, RequiredFieldRule, TypeValidationRule, StringLengthRule } from '../middleware/validation';
import { authRateLimit } from '../middleware/rateLimiting';
import { isValidUsername } from '../utils/validation';

const router = Router();
const authService = new AuthService();

/**
 * POST /api/auth/login
 * Authenticate faculty with username and password
 */
router.post('/login',
    authRateLimit,
    validateRequest([
        new RequiredFieldRule('username'),
        new RequiredFieldRule('password'),
        new TypeValidationRule('username', 'string'),
        new TypeValidationRule('password', 'string'),
        new StringLengthRule('username', 3, 50),
        new StringLengthRule('password', 1, 128)
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { username, password } = req.body as LoginCredentials;

            // Additional validation for username format (middleware handles basic validation)
            if (!isValidUsername(username)) {
                res.status(400).json(formatValidationError([{
                    field: 'username',
                    message: 'Username must contain only alphanumeric characters and underscores'
                }]));
                return;
            }

            // Attempt login
            const result = await authService.login({ username, password });

            if (!result.success) {
                res.status(401).json({
                    success: false,
                    error: result.error,
                    code: 'LOGIN_FAILED'
                });
                return;
            }

            res.json(formatSuccessResponse({
                user: result.user,
                accessToken: result.tokens?.accessToken,
                refreshToken: result.tokens?.refreshToken
            }, 'Login successful'));
        } catch (error) {
            console.error('Login endpoint error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    });

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', authenticateRefreshToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
            return;
        }

        // Verify user still exists and is active
        const userProfile = await authService.getUserProfile(req.user.userId);

        if (!userProfile || !userProfile.isActive) {
            res.status(401).json({
                success: false,
                error: 'User account is inactive or not found',
                code: 'USER_INACTIVE'
            });
            return;
        }

        // Generate new token pair
        const tokens = generateTokenPair(req.user.userId, req.user.username);

        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                user: {
                    id: userProfile.id,
                    username: userProfile.username,
                    name: userProfile.name,
                    email: userProfile.email
                }
            }
        });
    } catch (error) {
        console.error('Token refresh endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/auth/profile
 * Get current user profile
 */
router.get('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
            return;
        }

        const userProfile = await authService.getUserProfile(req.user.userId);

        if (!userProfile) {
            res.status(404).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
            return;
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: userProfile.id,
                    username: userProfile.username,
                    name: userProfile.name,
                    email: userProfile.email,
                    isActive: userProfile.isActive,
                    createdAt: userProfile.createdAt
                }
            }
        });
    } catch (error) {
        console.error('Profile endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateToken, (req: Request, res: Response): void => {
    // For JWT tokens, logout is primarily handled client-side by removing tokens
    // This endpoint serves as a confirmation and could be extended to maintain
    // a blacklist of tokens if needed

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * POST /api/auth/verify
 * Verify if current token is valid
 */
router.post('/verify', authenticateToken, (req: Request, res: Response): void => {
    // If we reach here, the token is valid (middleware passed)
    res.json({
        success: true,
        data: {
            valid: true,
            user: req.user
        }
    });
});

export default router;