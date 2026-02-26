import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User, Asset } from '../model';
import { Role } from '../common';

const assetsToSeed = [
        {
                name: 'Industrial Neural Interface',
                description: 'Direct neural link for high-speed industrial machinery control.',
                price: 4500.0,
                stock: 12,
                category: 'Cybernetics',
                assetType: 'smart_device',
                images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800']
        },
        {
                name: 'Digital Access Pass: Level 5',
                description: 'Full encryption-ready access pass for the secure core sector.',
                price: 75.0,
                stock: 1000,
                category: 'Security',
                assetType: 'event_pass',
                images: [
                        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200'
                ]
        }
];

const seedAssets = async () => {
        try {
                const dbUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/performance';
                console.log(`Connecting to: ${dbUrl}`);
                await mongoose.connect(dbUrl);
                console.log('Connected');

                const adminUser = await User.findOne({ role: Role.ADMIN });
                if (!adminUser) {
                        console.error('No admin user found.');
                        process.exit(1);
                }

                console.log('Clearing existing assets...');
                await Asset.deleteMany({});

                console.log('Seeding assets...');
                for (const asset of assetsToSeed) {
                        await Asset.create({
                                ...asset,
                                createdBy: adminUser._id,
                                isActive: true,
                                tags: [asset.category]
                        });
                        console.log(`- ${asset.name}`);
                }

                console.log('Seeding completed successfully.');
                process.exit(0);
        } catch (err) {
                console.error('Seeding failed:', err);
                process.exit(1);
        }
};

seedAssets();
