import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

import { FlashSale, Asset, Purchase } from '../model';
import AppError from '../common/utils/app.error';
import { paystackService } from '../services';
import { catchAsync } from '../middleware';
import { IFlashSale, IAsset } from '../common';
import { io } from '../server';

/** Type for a populated assetId field after Mongoose .populate() */
interface PopulatedAsset extends Pick<IAsset, 'name' | 'price' | 'images'> {
        _id: import('mongoose').Types.ObjectId;
}

/**
 * @desc    Get all flash sales
 * @route   GET /api/v1/flash-sales
 * @access  Private
 */
export const getFlashSales = catchAsync(async (req: Request, res: Response) => {
        // Clamp pagination to prevent resource exhaustion
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
        const status = req.query.status as string | undefined;
        const skip = (page - 1) * limit;

        const query: Partial<IFlashSale> = {};
        if (status) query.status = status as IFlashSale['status'];

        const [flashSales, total] = await Promise.all([
                FlashSale.find(query)
                        .skip(skip)
                        .limit(limit)
                        .populate('assets.assetId', 'name price images')
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
                .populate('assets.assetId', 'name description price images category')
                .sort({ startTime: 1 });

        res.status(200).json({
                status: 'success',
                data: { flashSales }
        });
});

interface FlashSaleAssetInput {
        assetId: string;
        salePrice: number;
        stockLimit: number;
}

/**
 * @desc    Create new flash sale
 * @route   POST /api/v1/flash-sales
 * @access  Private (Admin only)
 *
 * NOTE: Stock deduction + flash sale creation are wrapped in a MongoDB transaction
 * to ensure atomicity. This requires a MongoDB Replica Set (or Atlas).
 * A standalone single-node MongoDB instance will throw:
 *   "Transaction numbers are only allowed on a replica set member or mongos"
 * Use a replica set in all environments (local: mongod --replSet rs0).
 */
export const createFlashSale = catchAsync(async (req: Request, res: Response) => {
        const { title, description, assets, startTime, endTime, duration } = req.body;

        // Validate assets exist up front (before starting the transaction)
        const assetIds = (assets as FlashSaleAssetInput[]).map(a => a.assetId);
        const existingAssets = await Asset.find({ _id: { $in: assetIds } });

        if (existingAssets.length !== assetIds.length) {
                throw new AppError('One or more assets not found', 404);
        }

        const session = await mongoose.startSession();
        let flashSale: typeof FlashSale.prototype | undefined;

        try {
                await session.withTransaction(async () => {
                        // Deduct stock from each asset atomically within the transaction
                        for (const a of assets as FlashSaleAssetInput[]) {
                                const asset = await Asset.findOneAndUpdate(
                                        { _id: a.assetId, stock: { $gte: a.stockLimit } },
                                        { $inc: { stock: -a.stockLimit } },
                                        { new: true, session }
                                );
                                if (!asset) {
                                        // Throwing inside withTransaction causes automatic abort + rollback
                                        throw new AppError(`Insufficient stock for asset: ${a.assetId}`, 400);
                                }
                        }

                        const assetsWithStock = (assets as FlashSaleAssetInput[]).map(a => ({
                                assetId: new mongoose.Types.ObjectId(a.assetId),
                                salePrice: a.salePrice,
                                stockLimit: a.stockLimit,
                                stockRemaining: a.stockLimit
                        }));

                        [flashSale] = await FlashSale.create(
                                [
                                        {
                                                title,
                                                description,
                                                assets: assetsWithStock,
                                                startTime: new Date(startTime),
                                                endTime: new Date(endTime),
                                                duration,
                                                createdBy: req.user!._id
                                        }
                                ],
                                { session }
                        );
                });
        } finally {
                await session.endSession();
        }

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
        const { title, description, assets, startTime, endTime, duration, status } = req.body;

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

        if (assets) {
                const newAssets = assets as FlashSaleAssetInput[];

                // Handle stock adjustments
                for (const newA of newAssets) {
                        const oldA = flashSale.assets.find(a => a.assetId.toString() === newA.assetId);
                        if (oldA) {
                                const diff = newA.stockLimit - oldA.stockLimit;
                                if (diff > 0) {
                                        // Need more stock
                                        const asset = await Asset.findOneAndUpdate(
                                                { _id: newA.assetId, stock: { $gte: diff } },
                                                { $inc: { stock: -diff } }
                                        );
                                        if (!asset)
                                                throw new AppError(`Insufficient stock for asset ${newA.assetId}`, 400);
                                } else if (diff < 0) {
                                        // Return stock
                                        await Asset.findByIdAndUpdate(newA.assetId, {
                                                $inc: { stock: Math.abs(diff) }
                                        });
                                }
                                // Adjust stockRemaining by the same diff
                                oldA.stockRemaining = Math.max(0, oldA.stockRemaining + diff);
                                oldA.stockLimit = newA.stockLimit;
                                oldA.salePrice = newA.salePrice;
                        } else {
                                // New asset added to existing sale
                                const asset = await Asset.findOneAndUpdate(
                                        { _id: newA.assetId, stock: { $gte: newA.stockLimit } },
                                        { $inc: { stock: -newA.stockLimit } }
                                );
                                if (!asset) throw new AppError(`Insufficient stock for asset ${newA.assetId}`, 400);

                                flashSale.assets.push({
                                        assetId: new mongoose.Types.ObjectId(newA.assetId),
                                        salePrice: newA.salePrice,
                                        stockLimit: newA.stockLimit,
                                        stockRemaining: newA.stockLimit
                                } as IFlashSale['assets'][number]);
                        }
                }

                // Check for removed assets
                const removedAssets = flashSale.assets.filter(
                        oldA => !newAssets.find(newA => newA.assetId === oldA.assetId.toString())
                );
                for (const remA of removedAssets) {
                        await Asset.findByIdAndUpdate(remA.assetId, { $inc: { stock: remA.stockRemaining } });
                        flashSale.assets = flashSale.assets.filter(
                                a => a.assetId !== remA.assetId
                        ) as typeof flashSale.assets;
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
        for (const a of flashSale.assets) {
                if (a.stockRemaining > 0) {
                        await Asset.findByIdAndUpdate(a.assetId, { $inc: { stock: a.stockRemaining } });
                }
                a.stockRemaining = 0;
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
        if (flashSale.status !== 'ended' && flashSale.status !== 'cancelled') {
                for (const a of flashSale.assets) {
                        if (a.stockRemaining > 0) {
                                await Asset.findByIdAndUpdate(a.assetId, { $inc: { stock: a.stockRemaining } });
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
 * @desc    Purchase asset in flash sale
 * @route   POST /api/v1/flash-sales/:id/purchase
 * @access  Private
 *
 * NOTE: Stock decrement and Purchase creation are wrapped in a MongoDB transaction
 * to ensure atomicity — a crash between the two operations can no longer leave
 * stock decremented without a purchase record (or vice versa).
 * Requires a MongoDB Replica Set in your connection string.
 */
export const purchaseAsset = catchAsync(async (req: Request, res: Response) => {
        const { assetId } = req.body;
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

        const assetIndex = flashSale.assets.findIndex(a => a.assetId.toString() === assetId);

        if (assetIndex === -1) {
                throw new AppError('Asset not found in this flash sale', 404);
        }

        const saleAsset = flashSale.assets[assetIndex];

        if (saleAsset.stockRemaining <= 0) {
                throw new AppError('RESOURCE_EXHAUSTED: Out of stock', 400);
        }

        // Check if user already purchased from this sale
        const existingPurchase = await Purchase.findOne({ userId, flashSaleId });
        if (existingPurchase) {
                throw new AppError('SINGLE_UNIT_POLICY: You have already participated in this acquisition window', 400);
        }

        // Initialise Paystack payment before the transaction so we don't hold a DB session
        // while waiting on a network call
        const paymentReference = uuidv4();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const paystackResult = await paystackService.initializeTransaction(
                req.user!.email,
                saleAsset.salePrice,
                paymentReference,
                { userId, flashSaleId, assetId, username: req.user!.username }
        );

        if (!paystackResult) {
                throw new AppError('Payment initialization failed. Please try again.', 500);
        }

        // Atomically decrement stock AND create the purchase record in a transaction.
        // If either fails (e.g. stock depleted by a concurrent request), the whole
        // operation is rolled back automatically.
        const session = await mongoose.startSession();
        let purchase: InstanceType<typeof Purchase> | undefined;
        let updatedSale: typeof flashSale | null = null;

        try {
                await session.withTransaction(async () => {
                        updatedSale = await FlashSale.findOneAndUpdate(
                                {
                                        _id: flashSaleId,
                                        'assets.assetId': assetId,
                                        'assets.stockRemaining': { $gt: 0 }
                                },
                                { $inc: { 'assets.$.stockRemaining': -1 } },
                                { new: true, session }
                        );

                        if (!updatedSale) {
                                throw new AppError('RESOURCE_EXHAUSTED: Stock depleted mid-transaction', 400);
                        }

                        [purchase] = await Purchase.create(
                                [
                                        {
                                                userId: userId as unknown as mongoose.Types.ObjectId,
                                                assetId: new mongoose.Types.ObjectId(assetId as string),
                                                flashSaleId: new mongoose.Types.ObjectId(flashSaleId as string),
                                                price: saleAsset.salePrice,
                                                status: 'pending',
                                                paymentReference,
                                                expiresAt
                                        }
                                ],
                                { session }
                        );
                });
        } finally {
                await session.endSession();
        }

        // Emit real-time stock update after the transaction commits
        if (updatedSale) {
                const remainingStock = (updatedSale as typeof flashSale).assets[assetIndex].stockRemaining;
                io.to(`sale_${flashSaleId}`).emit('stock_update', {
                        assetId,
                        remainingStock
                });
        }

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
        // Clamp pagination to prevent resource exhaustion
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
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
 * @desc    Get flash sale status for a specific asset
 * @route   GET /api/v1/flash-sales/asset/:assetId
 * @access  Public
 */
export const getAssetFlashSaleStatus = catchAsync(async (req: Request, res: Response) => {
        const { assetId } = req.params;
        const now = new Date();

        const flashSale = await FlashSale.findOne({
                status: 'active',
                isActive: true,
                'assets.assetId': assetId,
                endTime: { $gte: now }
        }).populate('assets.assetId', 'name price images');

        if (!flashSale) {
                return res.status(200).json({
                        status: 'success',
                        data: null
                });
        }

        const saleAsset = flashSale.assets.find(a => a.assetId._id.toString() === assetId);

        res.status(200).json({
                status: 'success',
                data: {
                        _id: flashSale._id,
                        assetId: (saleAsset?.assetId as unknown as PopulatedAsset)._id,
                        assetName: (saleAsset?.assetId as unknown as PopulatedAsset).name,
                        assetImage: (saleAsset?.assetId as unknown as PopulatedAsset).images[0],
                        status: flashSale.startTime <= now ? 'live' : 'upcoming',
                        startsAt: flashSale.startTime,
                        endsAt: flashSale.endTime,
                        totalStock: saleAsset?.stockLimit,
                        remainingStock: saleAsset?.stockRemaining,
                        priceAmount: saleAsset?.salePrice,
                        priceCurrency: 'NGN'
                }
        });
});
