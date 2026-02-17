import { Request, Response, NextFunction } from 'express';

/**
 * Sanitizes an object in-place to prevent NoSQL injection and XSS
 */
const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
        if (obj instanceof Object) {
                for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                // 1. NoSQL Injection Prevention: Remove keys starting with $ or containing .
                                if (key.startsWith('$') || key.includes('.')) {
                                        delete obj[key];
                                        continue;
                                }

                                const value = obj[key];

                                // 2. XSS Prevention: Sanitize strings
                                if (typeof value === 'string') {
                                        obj[key] = value
                                                .replace(/&/g, '&amp;')
                                                .replace(/</g, '&lt;')
                                                .replace(/>/g, '&gt;')
                                                .replace(/"/g, '&quot;')
                                                .replace(/'/g, '&#x27;')
                                                .replace(/\//g, '&#x2F;');
                                } else if (typeof value === 'object' && value !== null) {
                                        sanitizeObject(value as Record<string, unknown>);
                                }
                        }
                }
        }
        return obj;
};

/**
 * Custom sanitization middleware for Express 5
 * Modifies req.body, req.query, and req.params in-place to avoid reassigning read-only properties
 */
export const customSanitizer = (req: Request, res: Response, next: NextFunction) => {
        if (req.body) sanitizeObject(req.body);
        if (req.query) sanitizeObject(req.query);
        if (req.params) sanitizeObject(req.params);
        next();
};
