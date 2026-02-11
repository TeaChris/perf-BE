import { Request, Response, NextFunction } from 'express';

import AppError from '../common/utils/app.error';
import { Role } from '../common';

/**
 * Middleware to restrict access based on user roles
 * @param roles - Array of roles allowed to access the route
 * @returns Express middleware function
 *
 * @example
 * router.post('/admin/products', protect, authorize(Role.ADMIN), createProduct);
 */
export const authorize = (...roles: Role[]) => {
        return (req: Request, res: Response, next: NextFunction) => {
                if (!req.user) {
                        return next(new AppError('Authentication required', 401));
                }

                if (!roles.includes(req.user.role)) {
                        return next(new AppError('You do not have permission to perform this action', 403));
                }

                next();
        };
};

/**
 * Convenience middleware to restrict access to admins only
 * Equivalent to authorize(Role.ADMIN)
 *
 * @example
 * router.post('/admin/dashboard', protect, adminOnly, getDashboard);
 */
export const adminOnly = authorize(Role.ADMIN);
