import mongoose from 'mongoose';

export interface IProduct {
        _id?: mongoose.Types.ObjectId;
        name: string;
        description: string;
        price: number;
        compareAtPrice?: number;
        stock: number;
        images: string[];
        category: string;
        tags: string[];
        isActive: boolean;
        createdBy: mongoose.Types.ObjectId;
        createdAt?: Date;
        updatedAt?: Date;
}

export interface IFlashSale {
        _id?: mongoose.Types.ObjectId;
        title: string;
        description: string;
        products: Array<{
                productId: mongoose.Types.ObjectId;
                salePrice: number;
                stockLimit: number;
                stockRemaining: number;
        }>;
        startTime: Date;
        endTime: Date;
        duration: number; // in minutes
        isActive: boolean;
        status: 'scheduled' | 'active' | 'ended' | 'cancelled';
        createdBy: mongoose.Types.ObjectId;
        createdAt?: Date;
        updatedAt?: Date;
}
