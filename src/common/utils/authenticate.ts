import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { HydratedDocument, Require_id } from 'mongoose';

import { User } from '../../model';
import AppError from './app.error';
import { redis, ENVIRONMENT } from '../../config';
import { IUser, UserMethods, toJSON, logger } from '../../common';

type AuthenticateResult = {
        currentUser: Require_id<IUser>;
        accessToken: string;
        refreshToken?: string;
};

type TokenPayload = {
        id: string;
        version: number;
        jti?: string;
};

type StoredRefreshData = {
        userId: string;
        context: string;
        grace?: boolean;
};

/** Grace period in seconds — old JTIs stay valid this long after rotation */
const ROTATION_GRACE_SECONDS = 10;

export const authenticate = async ({
        perfAccessToken,
        perfRefreshToken,
        ip,
        ua
}: {
        perfAccessToken?: string;
        perfRefreshToken?: string;
        ip?: string;
        ua?: string;
}): Promise<AuthenticateResult> => {
        // Simple hash for client context binding
        const getContextHash = () => {
                if (!ip && !ua) return 'no-context';
                return createHash('sha256').update(`${ip}-${ua}`).digest('hex');
        };

        const verifyAndFetchUser = async (
                userId: string,
                tokenVersion: number
        ): Promise<HydratedDocument<IUser, UserMethods>> => {
                // 1) Try to get user from cache (plain JSON)
                const cachedUser = await redis.get<IUser>(`user:${userId}`);

                let user: HydratedDocument<IUser, UserMethods>;
                if (cachedUser) {
                        user = User.hydrate(cachedUser) as HydratedDocument<IUser, UserMethods>;
                } else {
                        // 2) Fetch from database if not in cache
                        user = (await User.findById(userId).select(
                                '+isSuspended +isVerified +tokenVersion'
                        )) as unknown as HydratedDocument<IUser, UserMethods>;

                        if (!user) {
                                throw new AppError('Authentication failed', 401);
                        }

                        // 3) Cache plain JSON data
                        const userToCache = toJSON(user, ['password', '__v']);
                        await redis.set(`user:${userId}`, userToCache, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);
                }

                // Hardening: Check Token Version
                if (user.tokenVersion !== tokenVersion) {
                        throw new AppError('Session invalidated. Please log in again', 401);
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
                logger.warn(
                        `SECURITY: Revoking all sessions for user ${userId} due to suspected token reuse or context mismatch`
                );

                const userRefreshKey = `user:${userId}:refresh`;
                const activeJtis = await redis.smembers(userRefreshKey);

                if (activeJtis.length > 0) {
                        const keysToRevoke = activeJtis.map(jti => `refresh:${jti}`);
                        await Promise.all(keysToRevoke.map(key => redis.del(key)));
                        await redis.del(userRefreshKey);
                }
        };

        // helper function to handle refresh token rotation
        const handleRefreshToken = async (): Promise<AuthenticateResult> => {
                if (!perfRefreshToken) {
                        throw new AppError('Please log in to access this resource', 401);
                }

                const verifyOptions: jwt.VerifyOptions = {
                        issuer: ENVIRONMENT.APP.NAME,
                        audience: ENVIRONMENT.APP.CLIENT
                };

                try {
                        const decoded = jwt.verify(
                                perfRefreshToken,
                                ENVIRONMENT.JWT.REFRESH_KEY,
                                verifyOptions
                        ) as TokenPayload;

                        const currentUser = await verifyAndFetchUser(decoded.id, decoded.version);

                        // 1) Verify if this JTI is in the whitelist and check context
                        const storedData = await redis.get<StoredRefreshData>(`refresh:${decoded.jti}`);

                        if (!storedData) {
                                await revokeAllUserSessions(decoded.id);
                                throw new AppError('Session invalid. Please log in again', 401);
                        }

                        // Hardening: Verify Client Context Binding
                        if (storedData.context !== getContextHash()) {
                                logger.error(
                                        `SECURITY: Context mismatch for user ${decoded.id}. Expected ${storedData.context}, got ${getContextHash()}`
                                );
                                await revokeAllUserSessions(decoded.id);
                                throw new AppError('Session expired. Please log in again', 401);
                        }

                        // 2) If this JTI is in grace period (already rotated by a parallel request),
                        //    return the user without rotating again — the new tokens from the
                        //    first rotation will be set via cookies on that response.
                        if (storedData.grace) {
                                return {
                                        currentUser: currentUser as unknown as Require_id<IUser>,
                                        accessToken: perfAccessToken || '',
                                        refreshToken: undefined
                                };
                        }

                        // 3) Rotate the token — keep old JTI alive briefly for parallel requests
                        const graceData: StoredRefreshData = { ...storedData, grace: true };
                        await redis.set(`refresh:${decoded.jti}`, graceData, ROTATION_GRACE_SECONDS);
                        await redis.srem(`user:${decoded.id}:refresh`, decoded.jti!);

                        // Generate new JTI and tokens
                        const newJti = randomUUID();
                        const newAccessToken = currentUser.generateAccessToken({}, newJti);
                        const newRefreshToken = currentUser.generateRefreshToken({}, newJti);

                        // Whitelist new JTI with context and userId
                        const cacheData: StoredRefreshData = { userId: decoded.id, context: getContextHash() };
                        await redis.set(`refresh:${newJti}`, cacheData, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);
                        await redis.sadd(`user:${decoded.id}:refresh`, newJti);

                        return {
                                currentUser: currentUser as unknown as Require_id<IUser>,
                                accessToken: newAccessToken,
                                refreshToken: newRefreshToken
                        };
                } catch (err: unknown) {
                        if (err instanceof AppError) throw err;
                        logger.error('Refresh token rotation failed', { err });
                        throw new AppError('Session expired. Please log in again', 401);
                }
        };

        // 1) Verify Access Token if provided
        if (perfAccessToken) {
                const verifyOptions: jwt.VerifyOptions = {
                        issuer: ENVIRONMENT.APP.NAME,
                        audience: ENVIRONMENT.APP.CLIENT
                };

                try {
                        const decoded = jwt.verify(
                                perfAccessToken,
                                ENVIRONMENT.JWT.ACCESS_KEY,
                                verifyOptions
                        ) as TokenPayload;

                        // Security Hardening: Check if associated JTI is still valid in Redis
                        if (decoded.jti) {
                                const isValidSession = await redis.get(`refresh:${decoded.jti}`, false);
                                if (!isValidSession) {
                                        return handleRefreshToken();
                                }
                        }

                        const currentUser = await verifyAndFetchUser(decoded.id, decoded.version);

                        return {
                                currentUser: currentUser as unknown as Require_id<IUser>,
                                accessToken: perfAccessToken,
                                refreshToken: perfRefreshToken
                        };
                } catch (err: unknown) {
                        if (err instanceof Error && err.name !== 'TokenExpiredError') {
                                throw new AppError('Invalid session', 401);
                        }
                }
        }

        // 2) Access token is missing or expired, rotate refresh token
        return handleRefreshToken();
};
