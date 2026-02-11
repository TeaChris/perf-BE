import { Request, Response } from 'express';

import { FlashSale, Product } from '../model';
import { catchAsync } from '../middleware';
import AppError from '../common/utils/app.error';

/**
 * @desc    Get all flash sales
 * @route   GET /api/v1/flash-sales
 * @access  Private
 */
export const getFlashSales = catchAsync(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const { status } = req.query;
        const query: any = {};
        if (status) query.status = status;

        const [flashSales, total] = await Promise.all([
                FlashSale.find(query)
                        .skip(skip)
                        .limit(limit)
                        .populate('products.productId', 'name price images')
                        .populate('createdBy', 'username email')
                        .sort({ createdAt: -1 }),
                FlashSale.countDocuments(query)
        ]);

        res.status(200).json({
                status: 'success',
                data: {
                        flashSales,
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
 * @desc    Get active flash sales
 * @route   GET /api/v1/flash-sales/active
 * @access  Private
 */
export const getActiveFlashSales = catchAsync(async (req: Request, res: Response) => {
        const now = new Date();

        const flashSales = await FlashSale.find({
                status: 'active',
                isActive: true,
                startTime: { $lte: now },
                endTime: { $gte: now }
        })
                .populate('products.productId', 'name description price images category')
                .sort({ startTime: 1 });

        res.status(200).json({
                status: 'success',
                data: { flashSales }
        });
});

/**
 * @desc    Create new flash sale
 * @route   POST /api/v1/flash-sales
 * @access  Private (Admin only)
 */
export const createFlashSale = catchAsync(async (req: Request, res: Response) => {
        const { title, description, products, startTime, endTime, duration } = req.body;

        // Validate products exist
        const productIds = products.map((p: any) => p.productId);
        const existingProducts = await Product.find({ _id: { $in: productIds } });

        if (existingProducts.length !== productIds.length) {
                throw new AppError('One or more products not found', 404);
        }

        // Initialize stockRemaining same as stockLimit
        const productsWithStock = products.map((p: any) => ({
                ...p,
                stockRemaining: p.stockLimit
        }));

        const flashSale = await FlashSale.create({
                title,
                description,
                products: productsWithStock,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                duration,
                createdBy: req.user!._id
        });

        res.status(201).json({
                status: 'success',
                message: 'Flash sale created successfully',
                data: { flashSale }
        });
});

/**
 * @desc    Update flash sale
 * @route   PUT /api/v1/flash-sales/:id
 * @access  Private (Admin only)
 */
export const updateFlashSale = catchAsync(async (req: Request, res: Response) => {
        const { title, description, products, startTime, endTime, duration, status } = req.body;

        const flashSale = await FlashSale.findById(req.params.id);

        if (!flashSale) {
                throw new AppError('Flash sale not found', 404);
        }

        // Don't allow editing active or ended sales
        if (flashSale.status === 'active' || flashSale.status === 'ended') {
                throw new AppError('Cannot edit active or ended flash sales', 400);
        }

        flashSale.title = title || flashSale.title;
        flashSale.description = description || flashSale.description;
        flashSale.startTime = startTime ? new Date(startTime) : flashSale.startTime;
        flashSale.endTime = endTime ? new Date(endTime) : flashSale.endTime;
        flashSale.duration = duration || flashSale.duration;
        flashSale.status = status || flashSale.status;

        if (products) {
                const productsWithStock = products.map((p: any) => ({
                        ...p,
                        stockRemaining: p.stockLimit
                }));
                flashSale.products = productsWithStock;
        }

        await flashSale.save();

        res.status(200).json({
                status: 'success',
                message: 'Flash sale updated successfully',
                data: { flashSale }
        });
});

/**
 * @desc    Activate flash sale
 * @route   PATCH /api/v1/flash-sales/:id/activate
 * @access  Private (Admin only)
 */
export const activateFlashSale = catchAsync(async (req: Request, res: Response) => {
        const flashSale = await FlashSale.findByIdAndUpdate(
                req.params.id,
                { isActive: true, status: 'active' },
                { new: true }
        );

        if (!flashSale) {
                throw new AppError('Flash sale not found', 404);
        }

        res.status(200).json({
                status: 'success',
                message: 'Flash sale activated successfully',
                data: { flashSale }
        });
});

/**
 * @desc    Deactivate flash sale
 * @route   PATCH /api/v1/flash-sales/:id/deactivate
 * @access  Private (Admin only)
 */
export const deactivateFlashSale = catchAsync(async (req: Request, res: Response) => {
        const flashSale = await FlashSale.findByIdAndUpdate(
                req.params.id,
                { isActive: false, status: 'cancelled' },
                { new: true }
        );

        if (!flashSale) {
                throw new AppError('Flash sale not found', 404);
        }

        res.status(200).json({
                status: 'success',
                message: 'Flash sale deactivated successfully',
                data: { flashSale }
        });
});

/**
 * @desc    Delete flash sale
 * @route   DELETE /api/v1/flash-sales/:id
 * @access  Private (Admin only)
 */
export const deleteFlashSale = catchAsync(async (req: Request, res: Response) => {
        const flashSale = await FlashSale.findById(req.params.id);

        if (!flashSale) {
                throw new AppError('Flash sale not found', 404);
        }

        // Don't allow deleting active sales
        if (flashSale.status === 'active') {
                throw new AppError('Cannot delete active flash sale. Deactivate it first.', 400);
        }

        await flashSale.deleteOne();

        res.status(200).json({
                status: 'success',
                message: 'Flash sale deleted successfully'
        });
});
