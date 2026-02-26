import mongoose from 'mongoose';

export type AssetType = 'event_pass' | 'identity_badge' | 'smart_device' | 'intel_report';

export interface IAsset {
        _id?: mongoose.Types.ObjectId;
        name: string;
        description: string;
        price: number;
        compareAtPrice?: number;
        stock: number;
        images: string[];
        category: string;
        assetType: AssetType;
        tags: string[];
        isActive: boolean;
        accessDetails?: string;
        editionInfo?: string;
        metadata?: Record<string, unknown>;
        createdBy: mongoose.Types.ObjectId;
        createdAt?: Date;
        updatedAt?: Date;
}

export interface IFlashSale {
        _id?: mongoose.Types.ObjectId;
        title: string;
        description: string;
        assets: Array<{
                assetId: mongoose.Types.ObjectId;
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
