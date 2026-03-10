import mongoose, { Model } from 'mongoose';

import { IFlashSale } from '../common';

type FlashSaleModel = Model<IFlashSale>;

const flashSaleSchema = new mongoose.Schema<IFlashSale, FlashSaleModel>(
        {
                title: {
                        type: String,
                        required: [true, 'Flash sale title is required'],
                        trim: true,
                        maxlength: [200, 'Title cannot exceed 200 characters']
                },
                description: {
                        type: String,
                        required: [true, 'Flash sale description is required'],
                        trim: true
                },
                assets: [
                        {
                                assetId: {
                                        type: mongoose.Schema.Types.ObjectId,
                                        ref: 'Asset',
                                        required: true
                                },
                                salePrice: {
                                        type: Number,
                                        required: true,
                                        min: [0, 'Sale price cannot be negative']
                                },
                                stockLimit: {
                                        type: Number,
                                        required: true,
                                        min: [1, 'Stock limit must be at least 1']
                                },
                                stockRemaining: {
                                        type: Number,
                                        required: true,
                                        min: [0, 'Stock remaining cannot be negative']
                                }
                        }
                ],
                startTime: {
                        type: Date,
                        required: [true, 'Start time is required']
                },
                endTime: {
                        type: Date,
                        required: [true, 'End time is required']
                },
                duration: {
                        type: Number,
                        required: [true, 'Duration is required'],
                        min: [1, 'Duration must be at least 1 minute']
                },
                isActive: {
                        type: Boolean,
                        default: false
                },
                status: {
                        type: String,
                        enum: ['scheduled', 'active', 'ended', 'cancelled'],
                        default: 'scheduled'
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

// Validation: endTime must be after startTime
flashSaleSchema.pre('save', async function () {
        if (this.endTime <= this.startTime) {
                throw new Error('End time must be after start time');
        }
});

// Index for querying active sales
flashSaleSchema.index({ status: 1, startTime: 1, endTime: 1 });
flashSaleSchema.index({ isActive: 1 });
flashSaleSchema.index({ createdAt: -1 });

export const FlashSale =
        (mongoose.models.FlashSale as FlashSaleModel) ||
        mongoose.model<IFlashSale, FlashSaleModel>('FlashSale', flashSaleSchema);
