import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

import { catchAsync } from './catch.async';
import { twentyFourHours } from '@/common';
import AppError from '@/common/utils/app.error';
import { ALLOWED_ORIGINS, ENVIRONMENT } from '@/config';

const CSRF_PROTECTED_METHOD = ['POST', 'PUT', 'DELETE', 'PATCH'];

const csrfProtection = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        if (!CSRF_PROTECTED_METHOD.includes(req.method)) {
                return next();
        }

        if (req.path.startsWith('/api/v1/auth')) {
                return next();
        }

        // Paystack webhooks use HMAC signature verification, not CSRF tokens
        if (req.path.startsWith('/api/v1/payments/webhook')) {
                return next();
        }

        const origin = req.get('Origin');
        const referer = req.get('Referer');

        let originValid = false;

        if (origin) {
                originValid = ALLOWED_ORIGINS.some(allowedOrigin => origin.startsWith(allowedOrigin));
        } else if (referer) {
                originValid = ALLOWED_ORIGINS.some(allowedOrigin => referer.startsWith(allowedOrigin));
        }

        if (!originValid) {
                return next(new AppError('Invalid origin', 403));
        }

        const csrfHeader = req.get('x-csrf-token');
        const csrfCookie = req.cookies ? req.cookies.csrfToken : undefined;

        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
                return next(new AppError('CSRF token not found', 403));
        }

        next();
});

const setCsrfToken = (req: Request, res: Response, next: NextFunction) => {
        if (!req.cookies.csrfToken) {
                const csrfToken = crypto.randomBytes(32).toString('hex');

                res.cookie('csrfToken', csrfToken, {
                        httpOnly: false,
                        secure: ENVIRONMENT.APP.ENV === 'production',
                        sameSite: ENVIRONMENT.APP.ENV === 'production' ? 'none' : 'lax',
                        maxAge: twentyFourHours,
                        path: '/'
                });
        }

        next();
};

export { csrfProtection, setCsrfToken };
