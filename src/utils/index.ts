// Utility functions

export const asyncHandler = (fn: Function) => (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export const generateId = (): string => {
    return require('uuid').v4();
};

export const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const sanitizeInput = (input: string): string => {
    return input.trim().replace(/[<>]/g, '');
};