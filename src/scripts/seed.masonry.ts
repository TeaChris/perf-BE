import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User, Product } from '../model';
import { Role } from '../common';

const productsToSeed = [
        {
                name: 'Industrial Neural Interface',
                description:
                        'Direct neural link for high-speed industrial machinery control. Features redundant feedback loops and ceramic insulation. The tall profile of this unit mimics advanced cybernetic augmentation.',
                price: 4500.0,
                stock: 12,
                category: 'Cybernetics',
                images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800'] // Portrait
        },
        {
                name: 'Monolith Server Tower',
                description:
                        'Brutalist server housing with integrated cooling fins. Optimized for high-density compute clusters. Robust and reliable architecture for mission-critical operations.',
                price: 899.99,
                stock: 45,
                category: 'Infrastructure',
                images: [
                        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200'
                ] // Landscape
        },
        {
                name: 'Kinetic Energy Cell',
                description:
                        'Compact energy storage utilizing high-speed flywheels. Zero chemical waste, infinite cycles. A pinnacle of kinetic engineering.',
                price: 299.0,
                stock: 100,
                category: 'Energy',
                images: [
                        'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000'
                ] // Square-ish
        },
        {
                name: 'Signal Jammer X8',
                description:
                        'Localized signal masking device. Brushed steel finish with analog dials. Ensuring privacy and security in sensitive zones.',
                price: 450.0,
                stock: 30,
                category: 'Security',
                images: ['https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&q=80&w=800'] // Normal
        },
        {
                name: 'Optical Path Finder',
                description:
                        'Laser-based navigation tool for precise measurement in harsh environments. Speed and accuracy combined in a rugged housing.',
                price: 85.99,
                stock: 500,
                category: 'Tools',
                images: ['https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1000'] // Wide
        },
        {
                name: 'Carbon Mesh Shielding',
                description:
                        'Flexible RFI/EMI shielding material. Sold by the meter. Shielding sensitive electronics from external interference.',
                price: 15.5,
                stock: 1000,
                category: 'Materials',
                images: ['https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?auto=format&fit=crop&q=80&w=1200'] // Extra wide
        },
        {
                name: 'Obsidian Control Interface',
                description:
                        'Touch-sensitive control panel with haptic feedback. Encased in polished obsidian glass. Sleek, fast, and responsive.',
                price: 650.0,
                stock: 25,
                category: 'Cybernetics',
                images: ['https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'] // Deep
        },
        {
                name: 'Plasma Torch Assembly',
                description:
                        'Precision plasma cutting tool for industrial fabrication. The ultimate tool for material processing.',
                price: 3200.0,
                stock: 8,
                category: 'Tools',
                images: ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800'] // Square
        }
];

const seed = async () => {
        try {
                const dbUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/performance';
                console.log(`Connecting to: ${dbUrl}`);
                await mongoose.connect(dbUrl);
                console.log('Connected');

                const adminUser = await User.findOne({ role: Role.ADMIN });
                if (!adminUser) {
                        console.error('No admin user found. Please ensure an admin exists.');
                        process.exit(1);
                }

                console.log('Clearing existing products...');
                await Product.deleteMany({});

                console.log('Seeding 10 products for masonry grid...');
                for (const p of productsToSeed) {
                        await Product.create({
                                ...p,
                                compareAtPrice: p.price * 1.2,
                                createdBy: adminUser._id,
                                isActive: true,
                                tags: [p.category, 'Masonry-Test']
                        });
                        console.log(`- ${p.name}`);
                }

                console.log('Seeding completed successfully.');
                process.exit(0);
        } catch (err) {
                console.error('Seeding failed:', err);
                process.exit(1);
        }
};

seed();
