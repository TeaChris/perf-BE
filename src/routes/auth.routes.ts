import { Router } from 'express';

import { signUp, signIn, signOut } from '../controller';
import { registerSchema, loginSchema } from '../schema';
import { validateDataWithZod, protect } from '../middleware';

const router = Router();

router.post('/register', validateDataWithZod(registerSchema), signUp);
router.post('/login', validateDataWithZod(loginSchema), signIn);
router.post('/logout', protect, signOut);

export { router as authRouter };
