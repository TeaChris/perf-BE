import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import { getAssets, getAssetById, createAsset, updateAsset, deleteAsset } from '../controller';

const router = Router();

// Public routes (authenticated users)
router.get('/', protect, getAssets);
router.get('/:id', protect, getAssetById);

// Admin-only routes
router.post('/', protect, adminOnly, createAsset);
router.put('/:id', protect, adminOnly, updateAsset);
router.delete('/:id', protect, adminOnly, deleteAsset);

export { router as assetRouter };
