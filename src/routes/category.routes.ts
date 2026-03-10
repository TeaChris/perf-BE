import { Router } from 'express';
import { protect, adminOnly } from '../middleware';
import { getCategories, createCategory, deleteCategory } from '../controller';

const router = Router();

// Authenticated routes
router.get('/', protect, getCategories);

// Admin-only routes
router.post('/', protect, adminOnly, createCategory);
router.delete('/:id', protect, adminOnly, deleteCategory);

export { router as categoryRouter };
