import mongoose, { Model } from 'mongoose';
import { ICategory } from '../common';

type CategoryModel = Model<ICategory>;

const categorySchema = new mongoose.Schema<ICategory, CategoryModel>(
        {
                name: {
                        type: String,
                        required: [true, 'Category name is required'],
                        unique: true,
                        trim: true,
                        maxlength: [100, 'Category name cannot exceed 100 characters']
                },
                description: {
                        type: String,
                        trim: true,
                        maxlength: [500, 'Description cannot exceed 500 characters']
                },
                isActive: {
                        type: Boolean,
                        default: true
                }
        },
        {
                timestamps: true,
                versionKey: false
        }
);

// Index for performance
categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1 });

export const Category =
        (mongoose.models.Category as CategoryModel) ||
        mongoose.model<ICategory, CategoryModel>('Category', categorySchema);
