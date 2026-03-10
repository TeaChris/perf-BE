import { randomUUID, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import { User } from '../model';
import { catchAsync } from '../middleware';
import { redis, ENVIRONMENT } from '../config';
import { emailService } from '@/services/email.service';
import AppError from '../common/utils/app.error';
import { RegisterInput, LoginInput } from '../schema';
import { fifteenMinutes, setCookie, toJSON, getModuleLogger } from '../common';

const authLogger = getModuleLogger('auth-controller');

// Verification tokens expire after 24 hours
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Reset tokens expire after 1 hour
const RESET_TOKEN_TTL_MS = 1 * 60 * 60 * 1000;

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

        // 2) Generate verification token with expiry
        const verificationToken = randomUUID();
        const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

        // 3) Create user
        const user = await User.create({
                username,
                email,
                password,
                tokenVersion: 0,
                isTermsAndConditionAccepted,
                verificationToken,
                verificationTokenExpiresAt,
                isVerified: false
        });

        // 4) Send verification email
        await emailService.sendVerificationEmail(email, username, verificationToken);
        authLogger.info(`New user registered: ${email} (unverified)`);

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
        const token = req.params.token as string;

        // 1) Find user with this token
        const user = await User.findOne({ verificationToken: token }).select(
                '+verificationToken +verificationTokenExpiresAt'
        );

        if (!user) {
                throw new AppError('Invalid or expired verification token', 400);
        }

        // 2) Check token expiry
        if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
                throw new AppError(
                        'Verification token has expired. Please register again to receive a new verification email.',
                        400
                );
        }

        // 3) Mark user as verified and clear the token
        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpiresAt = null;
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
                authLogger.warn(`Failed login attempt for: ${email} - Invalid credentials`);
                throw new AppError('Invalid email or password', 401);
        }

        // Check if account is suspended
        if (user.isSuspended) {
                authLogger.warn(`Failed login attempt for: ${email} - Account suspended`);
                throw new AppError('Your account is currently suspended', 401);
        }

        // Check if account is verified
        if (!user.isVerified) {
                authLogger.warn(`Failed login attempt for: ${email} - Email not verified`);
                throw new AppError('Please verify your email to log in', 401);
        }

        // 2) Revoke all existing sessions (single-device enforcement)
        const userRefreshKey = `user:${user._id}:refresh`;
        const activeJtis = await redis.smembers(userRefreshKey);

        if (activeJtis.length > 0) {
                authLogger.info(
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

        // 6) Update lastLogin timestamp
        user.lastLogin = new Date();
        await user.save({ validateModifiedOnly: true });

        // 7) Update user cache to ensure session sync
        const userToCache = toJSON(user, ['password', '__v']);
        await redis.set(`user:${user._id}`, userToCache, ENVIRONMENT.JWT_EXPIRES_IN.REFRESH_SECONDS);

        authLogger.info(`User logged in: ${email} (${user._id})`);

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
                        // jwt is imported at the top of this file — no dynamic import needed
                        const decoded = jwt.verify(perfRefreshToken, ENVIRONMENT.JWT.REFRESH_KEY) as {
                                id: string;
                                jti: string;
                        };

                        if (decoded.jti) {
                                // Remove JTI from whitelist and user tracking set
                                await redis.del(`refresh:${decoded.jti}`);
                                await redis.srem(`user:${decoded.id}:refresh`, decoded.jti);
                                authLogger.info(`User logged out: ${decoded.id}`);
                        }
                } catch (err) {
                        authLogger.warn('Sign out: Refresh token verification failed or JTI missing', { err });
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

/**
 * @desc    Forgot password request
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
        const { email } = req.body;

        // 1) Find user
        const user = await User.findOne({ email });
        if (!user) {
                // High security: don't reveal if user exists. Return success regardless.
                authLogger.warn(`Password reset requested for non-existent email: ${email}`);
                return res.status(200).json({
                        status: 'success',
                        message: 'If an account with that email exists, we have sent a password reset link.'
                });
        }

        authLogger.info(`Password reset requested for: ${email}`);

        // 2) Generate reset token
        const resetToken = randomUUID();
        // Hash the token for DB storage (security best practice)
        const hashedToken = createHash('sha256').update(resetToken).digest('hex');

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await user.save({ validateBeforeSave: false });

        // 3) Send email
        try {
                await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
                res.status(200).json({
                        status: 'success',
                        message: 'If an account with that email exists, we have sent a password reset link.'
                });
        } catch (err) {
                user.passwordResetToken = null;
                user.passwordResetExpires = null;
                await user.save({ validateBeforeSave: false });
                throw new AppError('Error sending reset email. Try again later.', 500);
        }
});

/**
 * @desc    Reset password
 * @route   POST /api/v1/auth/reset-password/:token
 * @access  Public
 */
export const resetPassword = catchAsync(async (req: Request, res: Response) => {
        const token = req.params.token as string;
        const { password } = req.body;

        // 1) Hash the provided token (to match what's in DB)
        const hashedToken = createHash('sha256').update(token).digest('hex');

        // 2) Find user with valid token
        const user = await User.findOne({
                passwordResetToken: hashedToken,
                passwordResetExpires: { $gt: new Date() }
        }).select('+tokenVersion');

        if (!user) {
                throw new AppError('Token is invalid or has expired', 400);
        }

        // 3) Set new password and clear reset fields
        user.password = password;
        user.passwordResetToken = null;
        user.passwordResetExpires = null;

        // 4) High security: invalidate all current sessions by incrementing tokenVersion
        user.tokenVersion += 1;
        await user.save();

        // 5) Clean up Redis whitelists for this user
        const userRefreshKey = `user:${user._id}:refresh`;
        const activeJtis = await redis.smembers(userRefreshKey);
        if (activeJtis.length > 0) {
                const keysToRevoke = activeJtis.map(jti => `refresh:${jti}`);
                await Promise.all(keysToRevoke.map(key => redis.del(key)));
                await redis.del(userRefreshKey);
        }

        authLogger.info(`Password reset successful for user: ${user._id}`);

        res.status(200).json({
                status: 'success',
                message: 'Password reset successful! You can now log in.'
        });
});
