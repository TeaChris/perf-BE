import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { protect, adminOnly } from '../middleware';
import {
        getFlashSales,
        createFlashSale,
        updateFlashSale,
        deleteFlashSale,
        activateFlashSale,
        deactivateFlashSale,
        getActiveFlashSales,
        purchaseProduct,
        getSaleLeaderboard,
        getProductFlashSaleStatus
} from '../controller';

const router = Router();

// Stricter rate limit for purchase endpoint (5 attempts per minute per IP)
const purchaseRateLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 5,
        message: { status: 'error', message: 'Too many purchase attempts. Please wait before trying again.' },
        standardHeaders: true,
        legacyHeaders: false
});

// Public routes (general)
router.get('/product/:productId', getProductFlashSaleStatus);

// Public routes (authenticated users)
router.get('/', protect, getFlashSales);
router.get('/active', protect, getActiveFlashSales);
router.get('/:id/leaderboard', protect, getSaleLeaderboard);
router.post('/:id/purchase', protect, purchaseRateLimiter, purchaseProduct);

// Admin-only routes
router.post('/', protect, adminOnly, createFlashSale);
router.put('/:id', protect, adminOnly, updateFlashSale);
router.delete('/:id', protect, adminOnly, deleteFlashSale);
router.patch('/:id/activate', protect, adminOnly, activateFlashSale);
router.patch('/:id/deactivate', protect, adminOnly, deactivateFlashSale);

export { router as flashSaleRouter };
