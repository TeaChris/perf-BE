import { Request, Response, NextFunction } from 'express';

import { ENVIRONMENT } from '@/config';
import { catchAsync } from './catch.async';
import AppError from '@/common/utils/app.error';
import { authenticate, fifteenMinutes, setCookie } from '@/common';

export const protect = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const { perfAccessToken, perfRefreshToken } = req.cookies;

        const { currentUser, accessToken, refreshToken } = await authenticate({
                perfAccessToken,
                perfRefreshToken,
                ip: req.ip,
                ua: req.headers['user-agent']
        });

        // Update Access Token cookie (Sliding window)
        if (accessToken) {
                setCookie(res, 'perfAccessToken', accessToken, { maxAge: fifteenMinutes });
        }

        // Update Refresh Token cookie if it was rotated
        if (refreshToken) {
                setCookie(res, 'perfRefreshToken', refreshToken, {
                        maxAge: ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS * 1000
                });
        }

        req.user = currentUser;

        const reqPath = req.path;

        //   check if the user has been authenticated but has not verified their email
        if (currentUser && !currentUser.isVerified) {
                if (reqPath !== '/api/v1/auth/verify-email') {
                        return next(new AppError('Please verify your email to continue', 401));
                }
        }

        next();
});
