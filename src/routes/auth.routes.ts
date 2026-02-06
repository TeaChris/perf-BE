import { Router } from 'express';

import { signUp, signIn, signOut, getMe, verifyEmail } from '../controller';
import { registerSchema, loginSchema } from '../schema';
import { validateDataWithZod, protect } from '../middleware';

const router = Router();

router.post('/register', validateDataWithZod(registerSchema), signUp);
router.post('/login', validateDataWithZod(loginSchema), signIn);
router.get('/verify-email/:token', verifyEmail);
router.post('/logout', protect, signOut);
router.get('/me', protect, getMe);

export { router as authRouter };
