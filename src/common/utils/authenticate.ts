import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { HydratedDocument, Require_id } from 'mongoose';

import { User } from '@/model';
import AppError from './app.error';
import { ENVIRONMENT, redis } from '@/config';
import { logger, IUser, toJSON, UserMethods } from '@/common';

type AuthenticateResult = {
        currentUser: Require_id<IUser>;
        accessToken: string;
        refreshToken: string;
};

export const authenticate = async ({
        perfAccessToken,
        perfRefreshToken
}: {
        perfAccessToken?: string;
        perfRefreshToken?: string;
}): Promise<AuthenticateResult> => {
        const verifyAndFetchUser = async (userId: string): Promise<HydratedDocument<IUser, UserMethods>> => {
                // Try to get user from cache first
                const cachedUser = await redis.get<HydratedDocument<IUser, UserMethods>>(`user:${userId}`);

                let user: HydratedDocument<IUser, UserMethods>;
                if (cachedUser) {
                        user = cachedUser;
                } else {
                        // Fetch from database if not in cache
                        user = (await User.findById(userId).select(
                                '+isSuspended +isVerified'
                        )) as unknown as HydratedDocument<IUser, UserMethods>;

                        if (!user) {
                                // user not found ---- but to not expose too mush info i decided to use
                                throw new AppError('Authentication failed', 401);
                        }

                        // Cache user data (without sensitive fields)
                        const userToCache = toJSON(user, ['password', '__v']);
                        await redis.set(`user:${userId}`, userToCache, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);
                }

                // Check user status
                if (user.isSuspended) {
                        throw new AppError('Your account is currently suspended', 401);
                }

                if (!user.isVerified) {
                        throw new AppError('Your email is yet to be verified', 422, `email-unverified:${user.email}`);
                }

                return user;
        };

        // 1) Verify Access Token if provided
        if (perfAccessToken) {
                try {
                        const decoded = jwt.verify(perfAccessToken, ENVIRONMENT.JWT.ACCESS_KEY) as { id: string };
                        const currentUser = await verifyAndFetchUser(decoded.id);

                        return {
                                currentUser: currentUser as any as Require_id<IUser>,
                                accessToken: perfAccessToken,
                                refreshToken: perfRefreshToken || ''
                        };
                } catch (err: any) {
                        // If it's not an expired error, throw it
                        if (err.name !== 'TokenExpiredError') {
                                throw new AppError('Invalid token', 401);
                        }
                }
        }

        // 2) Access token is missing or expired, attempt to use Refresh Token
        if (!perfRefreshToken) {
                throw new AppError('Please log in to access this resource', 401);
        }

        try {
                const decoded = jwt.verify(perfRefreshToken, ENVIRONMENT.JWT.REFRESH_KEY) as { id: string };
                const currentUser = await verifyAndFetchUser(decoded.id);

                // Generate new tokens
                const newAccessToken = currentUser.generateAccessToken();
                const newRefreshToken = currentUser.generateRefreshToken();

                return {
                        currentUser: currentUser as any as Require_id<IUser>,
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken
                };
        } catch (err) {
                logger.error('Refresh token verification failed', { err });
                throw new AppError('Session expired. Please log in again', 401);
        }
};
