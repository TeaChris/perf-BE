import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { signUp, signIn, signOut, getMe, verifyEmail, forgotPassword, resetPassword } from '../controller';
import { registerSchema, loginSchema } from '../schema';
import { validateDataWithZod, protect } from '../middleware';

const router = Router();

// Stricter rate limiter for login — prevents brute-force password guessing
const loginRateLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: {
                status: 'error',
                message: 'Too many login attempts from this IP, please try again in 15 minutes.'
        },
        standardHeaders: true,
        legacyHeaders: false
});

// Rate limiter for forgot password requests to prevent email spamming
const forgotPasswordLimit = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
        message: {
                status: 'error',
                message: 'Too many password reset requests. Please try again in an hour.'
        }
});

router.post('/register', validateDataWithZod(registerSchema), signUp);
router.post('/login', loginRateLimiter, validateDataWithZod(loginSchema), signIn);
router.get('/verify-email/:token', verifyEmail);
router.post('/logout', protect, signOut);
router.get('/me', protect, getMe);

// Forgot Password routes
router.post('/forgot-password', forgotPasswordLimit, forgotPassword);
router.post('/reset-password/:token', resetPassword);

export { router as authRouter };
