import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

import { FlashSale, Product, Purchase } from '../model';
import AppError from '../common/utils/app.error';
import { paystackService } from '../services';
import { catchAsync } from '../middleware';
import { IFlashSale, IProduct } from '../common';
import { io } from '../server';

/** Type for a populated productId field after Mongoose .populate() */
interface PopulatedProduct extends Pick<IProduct, 'name' | 'price' | 'images'> {
        _id: import('mongoose').Types.ObjectId;
}

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

        // Deduct stock from products and validate availability
        for (const p of products as FlashSaleProductInput[]) {
                const product = await Product.findOneAndUpdate(
                        { _id: p.productId, stock: { $gte: p.stockLimit } },
                        { $inc: { stock: -p.stockLimit } },
                        { new: true }
                );

                if (!product) {
                        // Rollback already deducted stock if one fails
                        // Note: In a production app, use MongoDB Transactions.
                        // For simplicity here, we'll implement a basic cleanup or just throw.
                        const successfulIds = productIds.slice(0, productIds.indexOf(p.productId));
                        for (const sId of successfulIds) {
                                const sProd = (products as FlashSaleProductInput[]).find(
                                        prod => prod.productId === sId
                                );
                                if (sProd) {
                                        await Product.findByIdAndUpdate(sId, { $inc: { stock: sProd.stockLimit } });
                                }
                        }
                        throw new AppError(`Insufficient stock for product: ${p.productId} or product not found`, 400);
                }
        }

        // Prepare products with initial stock
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
                const newProducts = products as FlashSaleProductInput[];

                // Handle stock adjustments
                for (const newP of newProducts) {
                        const oldP = flashSale.products.find(p => p.productId.toString() === newP.productId);
                        if (oldP) {
                                const diff = newP.stockLimit - oldP.stockLimit;
                                if (diff > 0) {
                                        // Need more stock
                                        const product = await Product.findOneAndUpdate(
                                                { _id: newP.productId, stock: { $gte: diff } },
                                                { $inc: { stock: -diff } }
                                        );
                                        if (!product)
                                                throw new AppError(
                                                        `Insufficient stock for product ${newP.productId}`,
                                                        400
                                                );
                                } else if (diff < 0) {
                                        // Return stock
                                        await Product.findByIdAndUpdate(newP.productId, {
                                                $inc: { stock: Math.abs(diff) }
                                        });
                                }
                                // Adjust stockRemaining by the same diff
                                oldP.stockRemaining = Math.max(0, oldP.stockRemaining + diff);
                                oldP.stockLimit = newP.stockLimit;
                                oldP.salePrice = newP.salePrice;
                        } else {
                                // New product added to existing sale
                                const product = await Product.findOneAndUpdate(
                                        { _id: newP.productId, stock: { $gte: newP.stockLimit } },
                                        { $inc: { stock: -newP.stockLimit } }
                                );
                                if (!product)
                                        throw new AppError(`Insufficient stock for product ${newP.productId}`, 400);

                                flashSale.products.push({
                                        productId: new mongoose.Types.ObjectId(newP.productId),
                                        salePrice: newP.salePrice,
                                        stockLimit: newP.stockLimit,
                                        stockRemaining: newP.stockLimit
                                } as IFlashSale['products'][number]);
                        }
                }

                // Check for removed products
                const removedProducts = flashSale.products.filter(
                        oldP => !newProducts.find(newP => newP.productId === oldP.productId.toString())
                );
                for (const remP of removedProducts) {
                        await Product.findByIdAndUpdate(remP.productId, { $inc: { stock: remP.stockRemaining } });
                        flashSale.products = flashSale.products.filter(
                                p => p.productId !== remP.productId
                        ) as typeof flashSale.products;
                }
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
        const flashSale = await FlashSale.findById(req.params.id);

        if (!flashSale) {
                throw new AppError('Flash sale not found', 404);
        }

        // Return remaining stock to master record
        for (const p of flashSale.products) {
                if (p.stockRemaining > 0) {
                        await Product.findByIdAndUpdate(p.productId, { $inc: { stock: p.stockRemaining } });
                }
                p.stockRemaining = 0;
        }

        flashSale.isActive = false;
        flashSale.status = 'cancelled';
        await flashSale.save();

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

        // Return remaining stock to master record if it wasn't already returned
        // (i.e., if status is not 'ended' or 'cancelled')
        if (flashSale.status !== 'ended' && flashSale.status !== 'cancelled') {
                for (const p of flashSale.products) {
                        if (p.stockRemaining > 0) {
                                await Product.findByIdAndUpdate(p.productId, { $inc: { stock: p.stockRemaining } });
                        }
                }
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

        // Initialize payment with Paystack
        const paymentReference = uuidv4();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        const paystackResult = await paystackService.initializeTransaction(
                req.user!.email,
                saleProduct.salePrice,
                paymentReference,
                { userId, flashSaleId, productId, username: req.user!.username }
        );

        if (!paystackResult) {
                // Rollback stock if payment initialization fails
                await FlashSale.updateOne(
                        { _id: flashSaleId, 'products.productId': productId },
                        { $inc: { 'products.$.stockRemaining': 1 } }
                );
                throw new AppError('Payment initialization failed. Please try again.', 500);
        }

        // Create purchase record
        const purchase = await Purchase.create({
                userId: userId as unknown as mongoose.Types.ObjectId,
                productId: new mongoose.Types.ObjectId(productId as string),
                flashSaleId: new mongoose.Types.ObjectId(flashSaleId as string),
                price: saleProduct.salePrice,
                status: 'pending',
                paymentReference,
                expiresAt
        });

        // Emit real-time stock update
        const remainingStock = updatedSale.products[productIndex].stockRemaining;
        io.to(`sale_${flashSaleId}`).emit('stock_update', {
                productId,
                remainingStock
        });

        res.status(201).json({
                status: 'success',
                message: 'Payment initialized successfully. Redirecting to checkout.',
                data: {
                        purchase,
                        authorization_url: paystackResult.data.authorization_url
                }
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
                userId: (p.userId as unknown as { _id: import('mongoose').Types.ObjectId; username: string })._id,
                username: (
                        p.userId as unknown as { _id: import('mongoose').Types.ObjectId; username: string }
                ).username.replace(/(.{2}).+(.{2})/, '$1***$2'), // Mask username
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
                        productId: (saleProduct?.productId as unknown as PopulatedProduct)._id,
                        productName: (saleProduct?.productId as unknown as PopulatedProduct).name,
                        productImage: (saleProduct?.productId as unknown as PopulatedProduct).images[0],
                        status: flashSale.startTime <= now ? 'live' : 'upcoming',
                        startsAt: flashSale.startTime,
                        endsAt: flashSale.endTime,
                        totalStock: saleProduct?.stockLimit,
                        remainingStock: saleProduct?.stockRemaining,
                        priceAmount: saleProduct?.salePrice,
                        priceCurrency: 'NGN'
                }
        });
});
