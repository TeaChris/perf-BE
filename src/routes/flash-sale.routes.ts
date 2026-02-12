import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import {
        getFlashSales,
        createFlashSale,
        updateFlashSale,
        deleteFlashSale,
        activateFlashSale,
        deactivateFlashSale,
        getActiveFlashSales
} from '../controller';

const router = Router();

// Public routes (authenticated users)
router.get('/', protect, getFlashSales);
router.get('/active', protect, getActiveFlashSales);

// Admin-only routes
router.post('/', protect, adminOnly, createFlashSale);
router.put('/:id', protect, adminOnly, updateFlashSale);
router.delete('/:id', protect, adminOnly, deleteFlashSale);
router.patch('/:id/activate', protect, adminOnly, activateFlashSale);
router.patch('/:id/deactivate', protect, adminOnly, deactivateFlashSale);

export { router as flashSaleRouter };
