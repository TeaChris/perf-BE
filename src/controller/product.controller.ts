import { Request, Response } from 'express';

import { Product } from '../model';
import { catchAsync } from '../middleware';
import AppError from '../common/utils/app.error';
import { redis } from '../config';

/**
 * @desc    Get all products with pagination and filtering
 * @route   GET /api/v1/products
 * @access  Private (All authenticated users)
 */
export const getProducts = catchAsync(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const { category, search, isActive } = req.query;

        // Build query
        const query: any = {};
        if (category) query.category = category;
        if (search) query.$text = { $search: search as string };
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const [products, total] = await Promise.all([
                Product.find(query)
                        .skip(skip)
                        .limit(limit)
                        .populate('createdBy', 'username email')
                        .sort({ createdAt: -1 }),
                Product.countDocuments(query)
        ]);

        res.status(200).json({
                status: 'success',
                data: {
                        products,
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
 * @desc    Get single product by ID
 * @route   GET /api/v1/products/:id
 * @access  Private
 */
export const getProductById = catchAsync(async (req: Request, res: Response) => {
        const product = await Product.findById(req.params.id).populate('createdBy', 'username email');

        if (!product) {
                throw new AppError('Product not found', 404);
        }

        res.status(200).json({
                status: 'success',
                data: { product }
        });
});

/**
 * @desc    Create new product
 * @route   POST /api/v1/products
 * @access  Private (Admin only)
 */
export const createProduct = catchAsync(async (req: Request, res: Response) => {
        const { name, description, price, compareAtPrice, stock, images, category, tags } = req.body;

        const product = await Product.create({
                name,
                description,
                price,
                compareAtPrice,
                stock,
                images: images || [],
                category,
                tags: tags || [],
                createdBy: req.user!._id
        });

        // Clear cache for product listings
        await redis.del('products:*');

        res.status(201).json({
                status: 'success',
                message: 'Product created successfully',
                data: { product }
        });
});

/**
 * @desc    Update product
 * @route   PUT /api/v1/products/:id
 * @access  Private (Admin only)
 */
export const updateProduct = catchAsync(async (req: Request, res: Response) => {
        const { name, description, price, compareAtPrice, stock, images, category, tags, isActive } = req.body;

        const product = await Product.findByIdAndUpdate(
                req.params.id,
                {
                        name,
                        description,
                        price,
                        compareAtPrice,
                        stock,
                        images,
                        category,
                        tags,
                        isActive
                },
                { new: true, runValidators: true }
        );

        if (!product) {
                throw new AppError('Product not found', 404);
        }

        // Clear cache
        await redis.del('products:*');
        await redis.del(`product:${req.params.id}`);

        res.status(200).json({
                status: 'success',
                message: 'Product updated successfully',
                data: { product }
        });
});

/**
 * @desc    Delete product (soft delete by setting isActive to false)
 * @route   DELETE /api/v1/products/:id
 * @access  Private (Admin only)
 */
export const deleteProduct = catchAsync(async (req: Request, res: Response) => {
        const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

        if (!product) {
                throw new AppError('Product not found', 404);
        }

        // Clear cache
        await redis.del('products:*');
        await redis.del(`product:${req.params.id}`);

        res.status(200).json({
                status: 'success',
                message: 'Product deleted successfully'
        });
});
