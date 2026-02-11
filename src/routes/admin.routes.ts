import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import { getDashboardStats, getAllUsers, suspendUser, unsuspendUser, updateUserRole } from '../controller';

const router = Router();

// All routes are admin-only
router.use(protect, adminOnly);

router.get('/dashboard/stats', getDashboardStats);
router.get('/users', getAllUsers);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/unsuspend', unsuspendUser);
router.patch('/users/:id/role', updateUserRole);

export { router as adminRouter };
