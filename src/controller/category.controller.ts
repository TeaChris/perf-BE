import { Request, Response } from 'express';
import { Category } from '../model';
import { catchAsync } from '../middleware';
import AppError from '../common/utils/app.error';

/**
 * @desc    Get all active categories
 * @route   GET /api/v1/categories
 * @access  Private (All authenticated users)
 */
export const getCategories = catchAsync(async (req: Request, res: Response) => {
        const categories = await Category.find({ isActive: true }).sort({ name: 1 });

        res.status(200).json({
                status: 'success',
                results: categories.length,
                data: { categories }
        });
});

/**
 * @desc    Create new category
 * @route   POST /api/v1/categories
 * @access  Private (Admin only)
 */
export const createCategory = catchAsync(async (req: Request, res: Response) => {
        const { name, description } = req.body;

        if (!name) {
                throw new AppError('Category name is required', 400);
        }

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
                throw new AppError('Category already exists', 400);
        }

        const category = await Category.create({
                name,
                description
        });

        res.status(201).json({
                status: 'success',
                message: 'Category created successfully',
                data: { category }
        });
});

/**
 * @desc    Delete category (soft delete)
 * @route   DELETE /api/v1/categories/:id
 * @access  Private (Admin only)
 */
export const deleteCategory = catchAsync(async (req: Request, res: Response) => {
        const category = await Category.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

        if (!category) {
                throw new AppError('Category not found', 404);
        }

        res.status(200).json({
                status: 'success',
                message: 'Category deleted successfully'
        });
});
