import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to enhance React Native compatibility
 */
export const reactNativeCompatibility = (req: Request, res: Response, next: NextFunction): void => {
    // Detect React Native requests
    const userAgent = req.get('User-Agent') || '';
    const isReactNative = userAgent.includes('ReactNative') ||
        userAgent.includes('okhttp') ||
        req.get('X-React-Native') === 'true';

    // Add React Native detection to request object
    (req as any).isReactNative = isReactNative;

    // Set React Native specific headers
    if (isReactNative) {
        // Ensure proper content type handling
        res.header('Content-Type', 'application/json; charset=utf-8');

        // Add mobile-specific cache headers
        res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.header('Pragma', 'no-cache');
        res.header('Expires', '0');

        // Add custom header to identify server response
        res.header('X-API-Version', '1.0');
        res.header('X-Mobile-Compatible', 'true');
    }

    next();
};

/**
 * Success response formatter for React Native compatibility
 */
export const formatSuccessResponse = (data: any, message?: string, meta?: any) => {
    return {
        success: true,
        data,
        message: message || 'Operation completed successfully',
        timestamp: new Date().toISOString(),
        ...(meta && { meta })
    };
};

/**
 * Pagination response formatter for React Native
 */
export const formatPaginatedResponse = (
    data: any[],
    page: number,
    limit: number,
    total: number,
    message?: string
) => {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
        success: true,
        data,
        message: message || 'Data retrieved successfully',
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext,
            hasPrev,
            nextPage: hasNext ? page + 1 : null,
            prevPage: hasPrev ? page - 1 : null
        },
        timestamp: new Date().toISOString()
    };
};

/**
 * Validation error formatter for React Native
 */
export const formatValidationError = (errors: any[]) => {
    return {
        success: false,
        error: {
            code: 400,
            type: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors,
            timestamp: new Date().toISOString()
        }
    };
};