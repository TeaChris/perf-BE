import { Purchase } from '../model';
import mongoose from 'mongoose';

export const getSalesAndRevenueStats = async (period: 'daily' | 'weekly' | 'monthly') => {
        let groupBy: any;
        let dateFilter: Date;

        const now = new Date();

        if (period === 'daily') {
                dateFilter = new Date(now.setDate(now.getDate() - 30));
                groupBy = {
                        $dateToString: { format: '%Y-%m-%d', date: '$purchasedAt' }
                };
        } else if (period === 'weekly') {
                dateFilter = new Date(now.setDate(now.getDate() - 84)); // 12 weeks
                groupBy = {
                        $concat: [
                                { $dateToString: { format: '%Y-', date: '$purchasedAt' } },
                                { $toString: { $isoWeek: '$purchasedAt' } }
                        ]
                };
        } else {
                // monthly
                dateFilter = new Date(now.setFullYear(now.getFullYear() - 1)); // 1 year
                groupBy = {
                        $dateToString: { format: '%Y-%m', date: '$purchasedAt' }
                };
        }

        const stats = await Purchase.aggregate([
                {
                        $match: {
                                status: 'completed',
                                purchasedAt: { $gte: dateFilter }
                        }
                },
                {
                        $group: {
                                _id: groupBy,
                                revenue: { $sum: '$price' },
                                sales: { $count: {} }
                        }
                },
                { $sort: { _id: 1 } }
        ]);

        return stats;
};

export const getRevenueByAsset = async () => {
        const stats = await Purchase.aggregate([
                {
                        $match: {
                                status: 'completed'
                        }
                },
                {
                        $group: {
                                _id: '$assetId',
                                totalRevenue: { $sum: '$price' },
                                totalSales: { $count: {} }
                        }
                },
                {
                        $lookup: {
                                from: 'assets',
                                localField: '_id',
                                foreignField: '_id',
                                as: 'assetDetails'
                        }
                },
                { $unwind: '$assetDetails' },
                {
                        $project: {
                                _id: 1,
                                totalRevenue: 1,
                                totalSales: 1,
                                'assetDetails.name': 1,
                                'assetDetails.price': 1
                        }
                },
                { $sort: { totalRevenue: -1 } }
        ]);

        return stats;
};
