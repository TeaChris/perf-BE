import { Request, Response } from 'express';

import { Asset } from '../model';
import { catchAsync } from '../middleware';
import AppError from '../common/utils/app.error';
import { redis } from '../config';
import { IAsset } from '../common';

/**
 * @desc    Get all assets with pagination and filtering
 * @route   GET /api/v1/assets
 * @access  Private (All authenticated users)
 */
export const getAssets = catchAsync(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const { category, search, isActive, assetType } = req.query;

        // Build query
        const query: Partial<IAsset> & Record<string, unknown> = {};
        if (category) query.category = category as string;
        if (assetType) query.assetType = assetType as IAsset['assetType'];
        if (search) query['$text'] = { $search: search as string };
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const [assets, total] = await Promise.all([
                Asset.find(query)
                        .skip(skip)
                        .limit(limit)
                        .populate('createdBy', 'username email')
                        .sort({ createdAt: -1 }),
                Asset.countDocuments(query)
        ]);

        res.status(200).json({
                status: 'success',
                data: {
                        assets,
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
 * @desc    Get single asset by ID
 * @route   GET /api/v1/assets/:id
 * @access  Private
 */
export const getAssetById = catchAsync(async (req: Request, res: Response) => {
        const asset = await Asset.findById(req.params.id).populate('createdBy', 'username email');

        if (!asset) {
                throw new AppError('Asset not found', 404);
        }

        res.status(200).json({
                status: 'success',
                data: { asset }
        });
});

/**
 * @desc    Create new asset
 * @route   POST /api/v1/assets
 * @access  Private (Admin only)
 */
export const createAsset = catchAsync(async (req: Request, res: Response) => {
        const {
                name,
                description,
                price,
                compareAtPrice,
                stock,
                images,
                category,
                assetType,
                tags,
                accessDetails,
                editionInfo,
                metadata
        } = req.body;

        const asset = await Asset.create({
                name,
                description,
                price,
                compareAtPrice,
                stock,
                images: images || [],
                category,
                assetType,
                tags: tags || [],
                accessDetails,
                editionInfo,
                metadata,
                createdBy: req.user!._id
        });

        // Clear cache for asset listings
        await redis.del('assets:*');

        res.status(201).json({
                status: 'success',
                message: 'Asset created successfully',
                data: { asset }
        });
});

/**
 * @desc    Update asset
 * @route   PUT /api/v1/assets/:id
 * @access  Private (Admin only)
 */
export const updateAsset = catchAsync(async (req: Request, res: Response) => {
        const {
                name,
                description,
                price,
                compareAtPrice,
                stock,
                images,
                category,
                assetType,
                tags,
                isActive,
                accessDetails,
                editionInfo,
                metadata
        } = req.body;

        const asset = await Asset.findByIdAndUpdate(
                req.params.id,
                {
                        name,
                        description,
                        price,
                        compareAtPrice,
                        stock,
                        images,
                        category,
                        assetType,
                        tags,
                        isActive,
                        accessDetails,
                        editionInfo,
                        metadata
                },
                { new: true, runValidators: true }
        );

        if (!asset) {
                throw new AppError('Asset not found', 404);
        }

        // Clear cache
        await redis.del('assets:*');
        await redis.del(`asset:${req.params.id}`);

        res.status(200).json({
                status: 'success',
                message: 'Asset updated successfully',
                data: { asset }
        });
});

/**
 * @desc    Delete asset (soft delete by setting isActive to false)
 * @route   DELETE /api/v1/assets/:id
 * @access  Private (Admin only)
 */
export const deleteAsset = catchAsync(async (req: Request, res: Response) => {
        const asset = await Asset.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

        if (!asset) {
                throw new AppError('Asset not found', 404);
        }

        // Clear cache
        await redis.del('assets:*');
        await redis.del(`asset:${req.params.id}`);

        res.status(200).json({
                status: 'success',
                message: 'Asset deleted successfully'
        });
});
