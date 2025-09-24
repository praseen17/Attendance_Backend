/**
 * Utility functions for data validation and security
 */

/**
 * Validate if a string is a valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validate if a string is a valid email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Sanitize string input by trimming whitespace and removing potentially harmful characters
 */
export function sanitizeString(input: string): string {
    if (typeof input !== 'string') {
        return input;
    }

    return input
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/[<>]/g, ''); // Remove potential HTML/XML tags
}

/**
 * Validate roll number format (alphanumeric, 1-20 characters)
 */
export function isValidRollNumber(rollNumber: string): boolean {
    const rollNumberRegex = /^[a-zA-Z0-9]{1,20}$/;
    return rollNumberRegex.test(rollNumber);
}

/**
 * Validate name format (letters, spaces, hyphens, apostrophes, 1-100 characters)
 */
export function isValidName(name: string): boolean {
    const nameRegex = /^[a-zA-Z\s\-']{1,100}$/;
    return nameRegex.test(name.trim());
}

/**
 * Validate grade format (alphanumeric, 1-10 characters)
 */
export function isValidGrade(grade: string): boolean {
    const gradeRegex = /^[a-zA-Z0-9]{1,10}$/;
    return gradeRegex.test(grade);
}

/**
 * Validate username format (alphanumeric, underscores, and dots, 3-50 characters)
 */
export function isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_.]{3,50}$/;
    return usernameRegex.test(username);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate section name format
 */
export function isValidSectionName(sectionName: string): boolean {
    const sectionRegex = /^[a-zA-Z0-9\s\-]{1,50}$/;
    return sectionRegex.test(sectionName.trim());
}

/**
 * Validate attendance status
 */
export function isValidAttendanceStatus(status: string): boolean {
    return ['present', 'absent'].includes(status);
}

/**
 * Validate capture method
 */
export function isValidCaptureMethod(method: string): boolean {
    return ['ml', 'manual'].includes(method);
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(limit?: string, offset?: string): {
    isValid: boolean;
    limit: number;
    offset: number;
    errors: string[]
} {
    const errors: string[] = [];
    let validatedLimit = 50; // default
    let validatedOffset = 0; // default

    if (limit !== undefined) {
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
            errors.push('Limit must be a positive integer');
        } else if (parsedLimit > 1000) {
            errors.push('Limit cannot exceed 1000');
        } else {
            validatedLimit = parsedLimit;
        }
    }

    if (offset !== undefined) {
        const parsedOffset = parseInt(offset, 10);
        if (isNaN(parsedOffset) || parsedOffset < 0) {
            errors.push('Offset must be a non-negative integer');
        } else {
            validatedOffset = parsedOffset;
        }
    }

    return {
        isValid: errors.length === 0,
        limit: validatedLimit,
        offset: validatedOffset,
        errors
    };
}

/**
 * Validate date range
 */
export function validateDateRange(startDate?: string, endDate?: string): {
    isValid: boolean;
    startDate?: Date;
    endDate?: Date;
    errors: string[];
} {
    const errors: string[] = [];
    let validatedStartDate: Date | undefined;
    let validatedEndDate: Date | undefined;

    if (startDate) {
        validatedStartDate = new Date(startDate);
        if (isNaN(validatedStartDate.getTime())) {
            errors.push('Start date must be a valid date');
            validatedStartDate = undefined;
        }
    }

    if (endDate) {
        validatedEndDate = new Date(endDate);
        if (isNaN(validatedEndDate.getTime())) {
            errors.push('End date must be a valid date');
            validatedEndDate = undefined;
        }
    }

    if (validatedStartDate && validatedEndDate && validatedStartDate > validatedEndDate) {
        errors.push('Start date must be before or equal to end date');
    }

    return {
        isValid: errors.length === 0,
        startDate: validatedStartDate,
        endDate: validatedEndDate,
        errors
    };
}

/**
 * Escape SQL-like patterns for LIKE queries
 */
export function escapeSQLLikePattern(pattern: string): string {
    return pattern
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
}

/**
 * Validate and sanitize search query
 */
export function validateSearchQuery(query: string): { isValid: boolean; sanitized: string; error?: string } {
    if (typeof query !== 'string') {
        return { isValid: false, sanitized: '', error: 'Search query must be a string' };
    }

    const sanitized = sanitizeString(query);

    if (sanitized.length === 0) {
        return { isValid: false, sanitized: '', error: 'Search query cannot be empty' };
    }

    if (sanitized.length > 100) {
        return { isValid: false, sanitized: '', error: 'Search query cannot exceed 100 characters' };
    }

    // Check for potentially malicious patterns
    const maliciousPatterns = [
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
        /exec\s*\(/i,
        /script\s*>/i
    ];

    for (const pattern of maliciousPatterns) {
        if (pattern.test(sanitized)) {
            return { isValid: false, sanitized: '', error: 'Search query contains invalid characters' };
        }
    }

    return { isValid: true, sanitized };
}