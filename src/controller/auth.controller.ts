import { randomUUID, createHash } from 'crypto';
import { Request, Response } from 'express';

import { User } from '../model';
import { catchAsync } from '../middleware';
import { redis, ENVIRONMENT } from '../config';
import { emailService } from '@/services/email.service';
import AppError from '../common/utils/app.error';
import { RegisterInput, LoginInput } from '../schema';
import { fifteenMinutes, setCookie, toJSON, logger } from '../common';

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
export const signUp = catchAsync(async (req: Request, res: Response) => {
        const { username, email, password, isTermsAndConditionAccepted } = req.body as RegisterInput;

        // 1) Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
                throw new AppError('User with this email or username already exists', 400);
        }

        // 2) Generate verification token
        const verificationToken = randomUUID();

        // 3) Create user
        const user = await User.create({
                username,
                email,
                password,
                tokenVersion: 0,
                isTermsAndConditionAccepted,
                verificationToken,
                isVerified: false
        });

        // 4) Send verification email
        await emailService.sendVerificationEmail(email, username, verificationToken);

        res.status(201).json({
                status: 'success',
                message: 'Registration successful! Please check your email to verify your account.'
        });
});

/**
 * @desc    Verify email address
 * @route   GET /api/v1/auth/verify-email/:token
 * @access  Public
 */
export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
        const { token } = req.params;

        // 1) Find user with this token
        const user = await User.findOne({ verificationToken: token }).select('+verificationToken');

        if (!user) {
                throw new AppError('Invalid or expired verification token', 400);
        }

        // 2) Update user
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        res.status(200).json({
                status: 'success',
                message: 'Email verified successfully! You can now log in.'
        });
});

/**
 * @desc    Sign in a user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
export const signIn = catchAsync(async (req: Request, res: Response) => {
        const { email, password } = req.body as LoginInput;

        // 1) Check if user exists and include password for verification
        const user = await User.findOne({ email }).select('+password +isSuspended +isVerified +tokenVersion');
        if (!user || !(await user.verifyPassword(password))) {
                throw new AppError('Invalid email or password', 401);
        }

        // Check if account is suspended
        if (user.isSuspended) {
                throw new AppError('Your account is currently suspended', 401);
        }

        // Check if account is verified
        if (!user.isVerified) {
                throw new AppError('Please verify your email to log in', 401);
        }

        // 2) Revoke all existing sessions (single-device enforcement)
        const userRefreshKey = `user:${user._id}:refresh`;
        const activeJtis = await redis.smembers(userRefreshKey);

        if (activeJtis.length > 0) {
                logger.info(
                        `Revoking ${activeJtis.length} existing session(s) for user ${user._id} (single-device enforcement)`
                );
                const keysToRevoke = activeJtis.map(jti => `refresh:${jti}`);
                await Promise.all(keysToRevoke.map(key => redis.del(key)));
                await redis.del(userRefreshKey);
        }

        // 3) Generate JTI and tokens
        const jti = randomUUID();
        const accessToken = user.generateAccessToken({}, jti);
        const refreshToken = user.generateRefreshToken({}, jti);

        // 4) Whitelist JTI and track per user
        const contextHash = createHash('sha256').update(`${req.ip}-${req.headers['user-agent']}`).digest('hex');

        const cacheData = { userId: user._id.toString(), context: contextHash };
        await redis.set(`refresh:${jti}`, cacheData, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);
        await redis.sadd(`user:${user._id}:refresh`, jti);

        // 5) Set cookies
        setCookie(res, 'perfAccessToken', accessToken, { maxAge: fifteenMinutes });
        setCookie(res, 'perfRefreshToken', refreshToken, {
                maxAge: ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS * 1000
        });

        // 6) Update user cache to ensure session sync
        const userToCache = toJSON(user, ['password', '__v']);
        await redis.set(`user:${user._id}`, userToCache, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);

        res.status(200).json({
                status: 'success',
                message: 'Logged in successfully',
                data: {
                        user: userToCache
                }
        });
});

/**
 * @desc    Sign out a user
 * @route   POST /api/v1/auth/logout
 * @access  Private (but we handle missing cookies gracefully)
 */
export const signOut = catchAsync(async (req: Request, res: Response) => {
        const { perfRefreshToken } = req.cookies;

        if (perfRefreshToken) {
                try {
                        const jwt = await import('jsonwebtoken');
                        const decoded = jwt.verify(perfRefreshToken, ENVIRONMENT.JWT.REFRESH_KEY) as {
                                id: string;
                                jti: string;
                        };

                        if (decoded.jti) {
                                // Remove JTI from whitelist and user tracking set
                                await redis.del(`refresh:${decoded.jti}`);
                                await redis.srem(`user:${decoded.id}:refresh`, decoded.jti);
                        }
                } catch (err) {
                        logger.warn('Sign out: Refresh token verification failed or JTI missing', { err });
                }
        }

        // Always clear cookies
        res.clearCookie('perfAccessToken', { path: '/' });
        res.clearCookie('perfRefreshToken', { path: '/' });

        res.status(200).json({
                status: 'success',
                message: 'Logged out successfully'
        });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
export const getMe = catchAsync(async (req: Request, res: Response) => {
        // req.user is populated by the protect middleware
        if (!req.user) {
                throw new AppError('Authenticated user not found', 404);
        }
        const user = toJSON(req.user, ['password', '__v']);

        res.status(200).json({
                status: 'success',
                data: {
                        user
                }
        });
});
