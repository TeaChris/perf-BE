import { Router } from 'express';
import { handleWebhook, verifyPayment } from '../controller';
import { protect } from '../middleware';

const router = Router();

// Webhook is public (verification happens via signature)
router.post('/webhook', handleWebhook);

// Verification is private
router.get('/verify/:reference', protect, verifyPayment);

export { router as paymentRouter };
