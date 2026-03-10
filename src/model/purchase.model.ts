import mongoose, { Model } from 'mongoose';
import { IPurchase } from '../common';

type PurchaseModel = Model<IPurchase>;

const purchaseSchema = new mongoose.Schema<IPurchase, PurchaseModel>(
        {
                userId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'User',
                        required: [true, 'User ID is required']
                },
                assetId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Asset',
                        required: [true, 'Asset ID is required']
                },
                flashSaleId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'FlashSale',
                        required: [true, 'Flash sale ID is required']
                },
                price: {
                        type: Number,
                        required: [true, 'Purchase price is required']
                },
                status: {
                        type: String,
                        enum: ['pending', 'completed', 'failed', 'expired'],
                        default: 'pending'
                },
                paymentReference: {
                        type: String,
                        required: [true, 'Payment reference is required'],
                        unique: true
                },
                expiresAt: {
                        type: Date,
                        required: [true, 'Expiry time is required']
                },
                purchasedAt: {
                        type: Date
                }
        },
        {
                timestamps: true,
                versionKey: false
        }
);

// Index for checking duplicate purchases quickly
purchaseSchema.index({ userId: 1, flashSaleId: 1 }, { unique: true });
// Index for leaderboard queries
purchaseSchema.index({ flashSaleId: 1, purchasedAt: 1 });

export const Purchase =
        (mongoose.models.Purchase as PurchaseModel) ||
        mongoose.model<IPurchase, PurchaseModel>('Purchase', purchaseSchema);
