import mongoose from 'mongoose';

export interface IPurchase {
        _id?: mongoose.Types.ObjectId;
        userId: mongoose.Types.ObjectId;
        assetId: mongoose.Types.ObjectId;
        flashSaleId: mongoose.Types.ObjectId;
        price: number;
        status: 'pending' | 'completed' | 'failed' | 'expired';
        paymentReference: string;
        expiresAt: Date;
        purchasedAt?: Date;
        createdAt?: Date;
        updatedAt?: Date;
}
