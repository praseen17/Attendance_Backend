import { Request, Response, NextFunction } from 'express';
import { isValidUUID, isValidEmail, isValidName, isValidRollNumber, isValidGrade, sanitizeString } from '../utils/validation';

/**
 * Validation error interface
 */
export interface ValidationError {
    field: string;
    message: string;
    value?: any;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

/**
 * Base validation middleware factory
 */
export function validateRequest(validationRules: ValidationRule[]): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
        const errors: ValidationError[] = [];

        for (const rule of validationRules) {
            const result = rule.validate(req);
            if (!result.isValid) {
                errors.push(...result.errors);
            }
        }

        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors
            });
            return;
        }

        next();
    };
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
    validate(req: Request): ValidationResult;
}

/**
 * Required field validation rule
 */
export class RequiredFieldRule implements ValidationRule {
    constructor(
        private field: string,
        private location: 'body' | 'params' | 'query' = 'body',
        private customMessage?: string
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);
        const isValid = value !== undefined && value !== null && value !== '';

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: this.customMessage || `${this.field} is required`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Type validation rule
 */
export class TypeValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object',
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null)) {
            return { isValid: true, errors: [] };
        }

        const isValid = this.checkType(value);

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must be of type ${this.expectedType}`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }

    private checkType(value: any): boolean {
        switch (this.expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return false;
        }
    }
}

/**
 * UUID validation rule
 */
export class UUIDValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        const isValid = typeof value === 'string' && isValidUUID(value);

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must be a valid UUID`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Email validation rule
 */
export class EmailValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        const isValid = typeof value === 'string' && isValidEmail(value);

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must be a valid email address`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * String length validation rule
 */
export class StringLengthRule implements ValidationRule {
    constructor(
        private field: string,
        private minLength: number,
        private maxLength: number,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        if (typeof value !== 'string') {
            return {
                isValid: false,
                errors: [{
                    field: this.field,
                    message: `${this.field} must be a string`,
                    value
                }]
            };
        }

        const trimmedValue = value.trim();
        const isValid = trimmedValue.length >= this.minLength && trimmedValue.length <= this.maxLength;

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must be between ${this.minLength} and ${this.maxLength} characters`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Enum validation rule
 */
export class EnumValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private allowedValues: string[],
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        const isValid = this.allowedValues.includes(value);

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must be one of: ${this.allowedValues.join(', ')}`,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Date validation rule
 */
export class DateValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false,
        private allowFuture: boolean = false,
        private maxPastDays?: number
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        const date = new Date(value);
        const now = new Date();

        if (isNaN(date.getTime())) {
            return {
                isValid: false,
                errors: [{
                    field: this.field,
                    message: `${this.field} must be a valid date`,
                    value
                }]
            };
        }

        if (!this.allowFuture && date > now) {
            return {
                isValid: false,
                errors: [{
                    field: this.field,
                    message: `${this.field} cannot be in the future`,
                    value
                }]
            };
        }

        if (this.maxPastDays) {
            const maxPastDate = new Date();
            maxPastDate.setDate(maxPastDate.getDate() - this.maxPastDays);

            if (date < maxPastDate) {
                return {
                    isValid: false,
                    errors: [{
                        field: this.field,
                        message: `${this.field} cannot be more than ${this.maxPastDays} days in the past`,
                        value
                    }]
                };
            }
        }

        return { isValid: true, errors: [] };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Array validation rule
 */
export class ArrayValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private minLength: number = 0,
        private maxLength: number = 1000,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null)) {
            return { isValid: true, errors: [] };
        }

        if (!Array.isArray(value)) {
            return {
                isValid: false,
                errors: [{
                    field: this.field,
                    message: `${this.field} must be an array`,
                    value
                }]
            };
        }

        const isValid = value.length >= this.minLength && value.length <= this.maxLength;

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: `${this.field} must contain between ${this.minLength} and ${this.maxLength} items`,
                value: `Array with ${value.length} items`
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Custom validation rule
 */
export class CustomValidationRule implements ValidationRule {
    constructor(
        private field: string,
        private validator: (value: any) => boolean,
        private message: string,
        private location: 'body' | 'params' | 'query' = 'body',
        private optional: boolean = false
    ) { }

    validate(req: Request): ValidationResult {
        const value = this.getValue(req);

        if (this.optional && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [] };
        }

        const isValid = this.validator(value);

        return {
            isValid,
            errors: isValid ? [] : [{
                field: this.field,
                message: this.message,
                value
            }]
        };
    }

    private getValue(req: Request): any {
        switch (this.location) {
            case 'params':
                return req.params[this.field];
            case 'query':
                return req.query[this.field];
            default:
                return req.body[this.field];
        }
    }
}

/**
 * Sanitization middleware
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
    // Sanitize string fields in request body
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }

    next();
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}