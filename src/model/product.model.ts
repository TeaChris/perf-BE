import mongoose, { Model } from 'mongoose';

import { IProduct } from '../common';

type ProductModel = Model<IProduct>;

const productSchema = new mongoose.Schema<IProduct, ProductModel>(
        {
                name: {
                        type: String,
                        required: [true, 'Product name is required'],
                        trim: true,
                        maxlength: [200, 'Product name cannot exceed 200 characters']
                },
                description: {
                        type: String,
                        required: [true, 'Product description is required'],
                        trim: true
                },
                price: {
                        type: Number,
                        required: [true, 'Product price is required'],
                        min: [0, 'Price cannot be negative']
                },
                compareAtPrice: {
                        type: Number,
                        min: [0, 'Compare at price cannot be negative']
                },
                stock: {
                        type: Number,
                        required: [true, 'Stock quantity is required'],
                        min: [0, 'Stock cannot be negative'],
                        default: 0
                },
                images: {
                        type: [String],
                        default: []
                },
                category: {
                        type: String,
                        required: [true, 'Product category is required'],
                        trim: true
                },
                tags: {
                        type: [String],
                        default: []
                },
                isActive: {
                        type: Boolean,
                        default: true
                },
                createdBy: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'User',
                        required: [true, 'Creator is required']
                }
        },
        {
                timestamps: true,
                versionKey: false
        }
);

// Index for better query performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ createdAt: -1 });

// Only show active products by default
productSchema.pre(/^find/, function (this: mongoose.Query<any, IProduct>) {
        const query = this.getQuery();
        if (!Object.keys(query).includes('isActive')) {
                this.where({ isActive: true });
        }
});

export const Product =
        (mongoose.models.Product as ProductModel) || mongoose.model<IProduct, ProductModel>('Product', productSchema);
