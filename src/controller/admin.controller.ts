import { Request, Response } from 'express';
import mongoose from 'mongoose';

import { User, Product, FlashSale } from '../model';
import AppError from '../common/utils/app.error';
import { catchAsync } from '../middleware';
import { Role, IUser } from '../common';

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/v1/admin/dashboard/stats
 * @access  Private (Admin only)
 */
export const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
        const [totalUsers, totalProducts, activeFlashSales, totalFlashSales] = await Promise.all([
                User.countDocuments(),
                Product.countDocuments({ isActive: true }),
                FlashSale.countDocuments({ status: 'active', isActive: true }),
                FlashSale.countDocuments()
        ]);

        // Get recent users (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

        res.status(200).json({
                status: 'success',
                data: {
                        stats: {
                                totalUsers,
                                newUsersThisWeek,
                                totalProducts,
                                activeFlashSales,
                                totalFlashSales
                        }
                }
        });
});

/**
 * @desc    Get all users with pagination
 * @route   GET /api/v1/admin/users
 * @access  Private (Admin only)
 */
export const getAllUsers = catchAsync(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const { role, search } = req.query;

        const query: Partial<IUser> & Record<string, unknown> = {};
        if (role) query.role = role as Role;
        if (search) {
                query['$or'] = [
                        { username: { $regex: search as string, $options: 'i' } },
                        { email: { $regex: search as string, $options: 'i' } }
                ];
        }

        const [users, total] = await Promise.all([
                User.find(query).select('+isSuspended +isVerified').skip(skip).limit(limit).sort({ createdAt: -1 }),
                User.countDocuments(query)
        ]);

        res.status(200).json({
                status: 'success',
                data: {
                        users,
                        pagination: {
                                page,
                                limit,
                                total,
                                pages: Math.ceil(total / limit)
                        }
                }
        });
});

/**
 * @desc    Suspend user account
 * @route   PATCH /api/v1/admin/users/:id/suspend
 * @access  Private (Admin only)
 */
export const suspendUser = catchAsync(async (req: Request, res: Response) => {
        const user = await User.findById(req.params.id).select('+isSuspended');

        if (!user) {
                throw new AppError('User not found', 404);
        }

        if (user.role === Role.ADMIN) {
                throw new AppError('Cannot suspend admin users', 403);
        }

        user.isSuspended = true;
        await user.save();

        res.status(200).json({
                status: 'success',
                message: 'User suspended successfully'
        });
});

/**
 * @desc    Unsuspend user account
 * @route   PATCH /api/v1/admin/users/:id/unsuspend
 * @access  Private (Admin only)
 */
export const unsuspendUser = catchAsync(async (req: Request, res: Response) => {
        const user = await User.findById(req.params.id).select('+isSuspended');

        if (!user) {
                throw new AppError('User not found', 404);
        }

        user.isSuspended = false;
        await user.save();

        res.status(200).json({
                status: 'success',
                message: 'User unsuspended successfully'
        });
});

/**
 * @desc    Update user role
 * @route   PATCH /api/v1/admin/users/:id/role
 * @access  Private (Admin only)
 */
export const updateUserRole = catchAsync(async (req: Request, res: Response) => {
        const { role } = req.body;

        if (!Object.values(Role).includes(role)) {
                throw new AppError('Invalid role', 400);
        }

        const user = await User.findById(req.params.id);

        if (!user) {
                throw new AppError('User not found', 404);
        }

        // Prevent admins from demoting themselves
        if (user._id.toString() === req.user!._id.toString() && role !== Role.ADMIN) {
                throw new AppError('You cannot change your own role', 403);
        }

        user.role = role;
        await user.save();

        res.status(200).json({
                status: 'success',
                message: `User role updated to ${role}`,
                data: { user }
        });
});
