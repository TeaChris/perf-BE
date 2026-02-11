import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct } from '../controller';

const router = Router();

// Public routes (authenticated users)
router.get('/', protect, getProducts);
router.get('/:id', protect, getProductById);

// Admin-only routes
router.post('/', protect, adminOnly, createProduct);
router.put('/:id', protect, adminOnly, updateProduct);
router.delete('/:id', protect, adminOnly, deleteProduct);

export { router as productRouter };
