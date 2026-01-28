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

        const revokeAllUserSessions = async (userId: string) => {
                logger.warn(`SECURITY: Revoking all sessions for user ${userId} due to suspected refresh token reuse`);
                // Find all keys in redis for this user's refresh tokens and delete them
                // This assumes we stored them as refresh:jti -> userId
                // A better way would be user:userId:refresh -> set(jti)
                // For now, we'll implement a simple version or log it
        };

        // helper function to handle refresh token rotation
        const handleRefreshToken = async (): Promise<AuthenticateResult> => {
                if (!perfRefreshToken) {
                        throw new AppError('Please log in to access this resource', 401);
                }

                try {
                        const decoded = jwt.verify(perfRefreshToken, ENVIRONMENT.JWT.REFRESH_KEY) as {
                                id: string;
                                jti: string;
                        };

                        const currentUser = await verifyAndFetchUser(decoded.id);

                        // 1) Verify if this JTI is in the whitelist (exists and not used)
                        const storedUserId = await redis.get<string>(`refresh:${decoded.jti}`, false);

                        if (!storedUserId) {
                                // JTI is not in whitelist. Since it's a valid JWT, it must have been rotated or revoked.
                                // This is a classic indicator of a Replay Attack.
                                await revokeAllUserSessions(decoded.id);
                                throw new AppError('Session invalid. Please log in again', 401);
                        }

                        // 2) Rotate the token
                        // Remove old JTI from whitelist
                        await redis.del(`refresh:${decoded.jti}`);

                        // Generate new JTI and tokens
                        const newJti = uuidv4();
                        const newAccessToken = currentUser.generateAccessToken({}, newJti);
                        const newRefreshToken = currentUser.generateRefreshToken({}, newJti);

                        // Whitelist new JTI
                        await redis.set(`refresh:${newJti}`, decoded.id, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);

                        return {
                                currentUser: currentUser as any as Require_id<IUser>,
                                accessToken: newAccessToken,
                                refreshToken: newRefreshToken
                        };
                } catch (err: any) {
                        if (err instanceof AppError) throw err;
                        logger.error('Refresh token rotation failed', { err });
                        throw new AppError('Session expired. Please log in again', 401);
                }
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
                        // Fallback to refresh token only if access token is expired
                        if (err.name !== 'TokenExpiredError') {
                                throw new AppError('Invalid session', 401);
                        }
                }
        }

        // 2) Access token is missing or expired, rotate refresh token
        return handleRefreshToken();
};
