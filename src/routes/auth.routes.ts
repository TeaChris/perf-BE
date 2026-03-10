import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { signUp, signIn, signOut, getMe, verifyEmail } from '../controller';
import { registerSchema, loginSchema } from '../schema';
import { validateDataWithZod, protect } from '../middleware';

const router = Router();

// Stricter rate limiter for login — prevents brute-force password guessing
// 10 attempts per 15 minutes per IP
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

router.post('/register', validateDataWithZod(registerSchema), signUp);
router.post('/login', loginRateLimiter, validateDataWithZod(loginSchema), signIn);
router.get('/verify-email/:token', verifyEmail);
router.post('/logout', protect, signOut);
router.get('/me', protect, getMe);

export { router as authRouter };
