import mongoose, { Model } from 'mongoose';

import { IAsset } from '../common';

type AssetModel = Model<IAsset>;

const assetSchema = new mongoose.Schema<IAsset, AssetModel>(
        {
                name: {
                        type: String,
                        required: [true, 'Asset name is required'],
                        trim: true,
                        maxlength: [200, 'Asset name cannot exceed 200 characters']
                },
                description: {
                        type: String,
                        required: [true, 'Asset description is required'],
                        trim: true
                },
                price: {
                        type: Number,
                        required: [true, 'Asset price is required'],
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
                        required: [true, 'Asset category is required'],
                        trim: true
                },
                assetType: {
                        type: String,
                        required: [true, 'Asset type is required'],
                        enum: {
                                values: ['event_pass', 'identity_badge', 'smart_device', 'intel_report'],
                                message: 'Asset type must be one of: event_pass, identity_badge, smart_device, intel_report'
                        }
                },
                tags: {
                        type: [String],
                        default: []
                },
                isActive: {
                        type: Boolean,
                        default: true
                },
                accessDetails: {
                        type: String,
                        trim: true
                },
                editionInfo: {
                        type: String,
                        trim: true
                },
                metadata: {
                        type: mongoose.Schema.Types.Mixed,
                        default: {}
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
assetSchema.index({ name: 'text', description: 'text' });
assetSchema.index({ category: 1 });
assetSchema.index({ assetType: 1 });
assetSchema.index({ isActive: 1 });
assetSchema.index({ createdAt: -1 });

// Only show active assets by default
assetSchema.pre(/^find/, function (this: mongoose.Query<any, IAsset>) {
        const query = this.getQuery();
        if (!Object.keys(query).includes('isActive')) {
                this.where({ isActive: true });
        }
});

export const Asset = (mongoose.models.Asset as AssetModel) || mongoose.model<IAsset, AssetModel>('Asset', assetSchema);
