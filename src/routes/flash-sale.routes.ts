import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import {
	getFlashSales,
	getActiveFlashSales,
	createFlashSale,
	updateFlashSale,
	activateFlashSale,
	deactivateFlashSale,
	deleteFlashSale
} from '../controller';

const router = Router();

// Public routes (authenticated users)
router.get('/', protect, getFlashSales);
router.get('/active', protect, getActiveFlashSales);

// Admin-only routes
router.post('/', protect, adminOnly, createFlashSale);
router.put('/:id', protect, adminOnly, updateFlashSale);
router.patch('/:id/activate', protect, adminOnly, activateFlashSale);
router.patch('/:id/deactivate', protect, adminOnly, deactivateFlashSale);
router.delete('/:id', protect, adminOnly, deleteFlashSale);

export { router as flashSaleRouter };
