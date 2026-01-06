import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { catchAsync } from './catch.async';
import AppError from '@/common/utils/app.error';
import { ENVIRONMENT } from '@/config';
import { twentyFourHours } from '@/common';

const CSRF_PROTECTED_METHOD = ['POST', 'PUT', 'DELETE', 'PATCH'];

const ALLOWED_ORIGIN = [
      ENVIRONMENT.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'

      //   add protection domain here
];

const csrfProtection = catchAsync(async (req: Request, res: Request, next: NextFunction) => {
      if (!CSRF_PROTECTED_METHOD.includes(req.method)) {
            return next();
      }

      if (req.path.startsWith('/api/v1/auth')) {
            return next();
      }

      const origin = req.get('Origin');
      const referer = req.get('Referer');

      let originValid = false;

      if (origin) {
            originValid = ALLOWED_ORIGIN.some(allowedOrigin => origin.startsWith(allowedOrigin));
      } else if (referer) {
            originValid = ALLOWED_ORIGIN.some(allowedOrigin => referer.startsWith(allowedOrigin));
      }

      if (!originValid) {
            return next(new AppError('Invalid origin', 403));
      }

      const csrfHeader = req.get('x-csrf-token');
      const csrfCookie = req.cookie?.csrfToken;

      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
            return next(new AppError('CSRF token not found', 403));
      }

      next();
});

const setCsrfToken = (req: Request, res: Response, next: NextFunction) => {
      if (!req.cookies.csrfToken) {
            const csrfToken = uuidv4();

            res.cookie('csrfToken', csrfToken, {
                  httpOnly: true,
                  secure: ENVIRONMENT.APP.ENV === 'production',
                  sameSite: ENVIRONMENT.APP.ENV === 'production' ? 'none' : 'lax',
                  maxAge: twentyFourHours,
                  path: '/'
            });
      }

      next();
};

export { csrfProtection, setCsrfToken };
