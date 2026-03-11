import { Router } from 'express';

import { protect, adminOnly } from '../middleware';
import {
        getAllUsers,
        suspendUser,
        getAnalytics,
        unsuspendUser,
        updateUserRole,
        getDashboardStats
} from '../controller';

const router = Router();

// All routes are admin-only
router.use(protect, adminOnly);

router.get('/users', getAllUsers);
router.get('/analytics', getAnalytics);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/role', updateUserRole);
router.get('/dashboard/stats', getDashboardStats);
router.patch('/users/:id/unsuspend', unsuspendUser);

export { router as adminRouter };
