import mongoose from 'mongoose';

export interface IPurchase {
        _id?: mongoose.Types.ObjectId;
        userId: mongoose.Types.ObjectId;
        productId: mongoose.Types.ObjectId;
        flashSaleId: mongoose.Types.ObjectId;
        price: number;
        purchasedAt: Date;
        createdAt?: Date;
        updatedAt?: Date;
}
