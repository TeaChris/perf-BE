import mongoose from 'mongoose';
import { Request, Response } from 'express';

import { FlashSale, Product, Purchase } from '../model';
import AppError from '../common/utils/app.error';
import { catchAsync } from '../middleware';
import { IFlashSale } from '../common';
import { io } from '../server';

/**
 * @desc    Get all flash sales
 * @route   GET /api/v1/flash-sales
 * @access  Private
 */
export const getFlashSales = catchAsync(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const status = req.query.status as string | undefined;
        const skip = (page - 1) * limit;

        const query: Partial<IFlashSale> = {};
        if (status) query.status = status as IFlashSale['status'];

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

interface FlashSaleProductInput {
        productId: string;
        salePrice: number;
        stockLimit: number;
}

/**
 * @desc    Create new flash sale
 * @route   POST /api/v1/flash-sales
 * @access  Private (Admin only)
 */
export const createFlashSale = catchAsync(async (req: Request, res: Response) => {
        const { title, description, products, startTime, endTime, duration } = req.body;

        // Validate products exist
        const productIds = (products as FlashSaleProductInput[]).map(p => p.productId);
        const existingProducts = await Product.find({ _id: { $in: productIds } });

        if (existingProducts.length !== productIds.length) {
                throw new AppError('One or more products not found', 404);
        }

        // Initialize stockRemaining same as stockLimit
        const productsWithStock = (products as FlashSaleProductInput[]).map(p => ({
                productId: new mongoose.Types.ObjectId(p.productId),
                salePrice: p.salePrice,
                stockLimit: p.stockLimit,
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
                const productsWithStock = (products as FlashSaleProductInput[]).map(p => ({
                        productId: new mongoose.Types.ObjectId(p.productId),
                        salePrice: p.salePrice,
                        stockLimit: p.stockLimit,
                        stockRemaining: p.stockLimit
                }));
                flashSale.products = productsWithStock as typeof flashSale.products;
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

/**
 * @desc    Purchase product in flash sale
 * @route   POST /api/v1/flash-sales/:id/purchase
 * @access  Private
 */
export const purchaseProduct = catchAsync(async (req: Request, res: Response) => {
        const { productId } = req.body;
        const flashSaleId = req.params.id;
        const userId = req.user!._id;

        const flashSale = await FlashSale.findOne({
                _id: flashSaleId,
                status: 'active',
                isActive: true,
                startTime: { $lte: new Date() },
                endTime: { $gte: new Date() }
        });

        if (!flashSale) {
                throw new AppError('Flash sale is not active or not found', 404);
        }

        const productIndex = flashSale.products.findIndex(p => p.productId.toString() === productId);

        if (productIndex === -1) {
                throw new AppError('Product not found in this flash sale', 404);
        }

        const saleProduct = flashSale.products[productIndex];

        if (saleProduct.stockRemaining <= 0) {
                throw new AppError('RESOURCE_EXHAUSTED: Out of stock', 400);
        }

        // Check if user already purchased from this sale
        const existingPurchase = await Purchase.findOne({ userId, flashSaleId });
        if (existingPurchase) {
                throw new AppError('SINGLE_UNIT_POLICY: You have already participated in this acquisition window', 400);
        }

        // Atomic update for stock
        const updatedSale = await FlashSale.findOneAndUpdate(
                {
                        _id: flashSaleId,
                        'products.productId': productId,
                        'products.stockRemaining': { $gt: 0 }
                },
                {
                        $inc: { 'products.$.stockRemaining': -1 }
                },
                { new: true }
        );

        if (!updatedSale) {
                throw new AppError('RESOURCE_EXHAUSTED: Stock depleted mid-transaction', 400);
        }

        // Create purchase record
        const purchase = await Purchase.create({
                userId: userId as unknown as mongoose.Types.ObjectId,
                productId: new mongoose.Types.ObjectId(productId as string),
                flashSaleId: new mongoose.Types.ObjectId(flashSaleId as string),
                price: saleProduct.salePrice,
                purchasedAt: new Date()
        });

        // Emit real-time updates
        const remainingStock = updatedSale.products[productIndex].stockRemaining;
        io.to(`sale_${flashSaleId}`).emit('stock_update', {
                productId,
                remainingStock
        });

        io.to(`sale_${flashSaleId}`).emit('new_purchase', {
                username: req.user!.username,
                purchasedAt: purchase.purchasedAt
        });

        res.status(201).json({
                status: 'success',
                message: 'Acquisition finalized successfully',
                data: { purchase }
        });
});

/**
 * @desc    Get flash sale leaderboard
 * @route   GET /api/v1/flash-sales/:id/leaderboard
 * @access  Private
 */
export const getSaleLeaderboard = catchAsync(async (req: Request, res: Response) => {
        const flashSaleId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [purchases, total] = await Promise.all([
                Purchase.find({ flashSaleId })
                        .sort({ purchasedAt: 1 })
                        .skip(skip)
                        .limit(limit)
                        .populate('userId', 'username email'),
                Purchase.countDocuments({ flashSaleId })
        ]);

        const entries = purchases.map((p, index) => ({
                rank: skip + index + 1,
                userId: (p.userId as any)._id,
                username: (p.userId as any).username.replace(/(.{2}).+(.{2})/, '$1***$2'), // Mask username
                purchasedAt: p.purchasedAt
        }));

        res.status(200).json({
                status: 'success',
                data: {
                        entries,
                        total,
                        page,
                        limit,
                        pages: Math.ceil(total / limit)
                }
        });
});

/**
 * @desc    Get flash sale status for a specific product
 * @route   GET /api/v1/flash-sales/product/:productId
 * @access  Public
 */
export const getProductFlashSaleStatus = catchAsync(async (req: Request, res: Response) => {
        const { productId } = req.params;
        const now = new Date();

        const flashSale = await FlashSale.findOne({
                status: 'active',
                isActive: true,
                'products.productId': productId,
                endTime: { $gte: now }
        }).populate('products.productId', 'name price images');

        if (!flashSale) {
                return res.status(200).json({
                        status: 'success',
                        data: null
                });
        }

        const saleProduct = flashSale.products.find(p => p.productId._id.toString() === productId);

        res.status(200).json({
                status: 'success',
                data: {
                        _id: flashSale._id,
                        productId: (saleProduct?.productId as any)._id,
                        productName: (saleProduct?.productId as any).name,
                        productImage: (saleProduct?.productId as any).images[0],
                        status: flashSale.startTime <= now ? 'live' : 'upcoming',
                        startsAt: flashSale.startTime,
                        endsAt: flashSale.endTime,
                        totalStock: saleProduct?.stockLimit,
                        remainingStock: saleProduct?.stockRemaining,
                        priceAmount: saleProduct?.salePrice,
                        priceCurrency: 'USD'
                }
        });
});
