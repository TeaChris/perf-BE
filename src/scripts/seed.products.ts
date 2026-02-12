import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User, Product } from '../model';
import { Role } from '../common';

const seedProducts = async () => {
        try {
                const dbUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/performance';
                console.log(`Connecting to database: ${dbUrl}`);

                await mongoose.connect(dbUrl);
                console.log('Connected to MongoDB');

                // 1. Find an admin user
                const adminUser = await User.findOne({ role: Role.ADMIN });

                if (!adminUser) {
                        console.error('No admin user found. Please create an admin user first.');
                        process.exit(1);
                }

                console.log(`Using admin user: ${adminUser.username} (${adminUser._id})`);

                // 2. Define products
                const productsToSeed = [
                        {
                                name: 'Quantum Processor X1',
                                description:
                                        'Experience unparalleled computing power with the Quantum Processor X1. Featuring 128 cores and advanced AI acceleration, it is designed for the most demanding industrial applications and neural network training.',
                                price: 1299.99,
                                compareAtPrice: 1499.99,
                                stock: 50,
                                images: [
                                        'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=1000&auto=format&fit=crop'
                                ],
                                category: 'Processors',
                                tags: ['Quantum', 'Industrial', 'High-Performance', 'AI'],
                                isActive: true,
                                createdBy: adminUser._id
                        },
                        {
                                name: 'Neon Core Headset',
                                description:
                                        'The Neon Core Headset delivers studio-grade audio with zero-latency wireless connectivity. Its industrial brutalist design hides a sophisticated noise-canceling array and haptic feedback drivers.',
                                price: 199.99,
                                compareAtPrice: 249.99,
                                stock: 150,
                                images: [
                                        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000&auto=format&fit=crop'
                                ],
                                category: 'Audio',
                                tags: ['Gaming', 'Professional', 'Wireless', 'Noise-Canceling'],
                                isActive: true,
                                createdBy: adminUser._id
                        }
                ];

                // 3. Insert products
                console.log('Seeding products...');

                for (const productData of productsToSeed) {
                        // Check if product already exists
                        const existingProduct = await Product.findOne({ name: productData.name });
                        if (existingProduct) {
                                console.log(`Product "${productData.name}" already exists. Skipping.`);
                                continue;
                        }

                        await Product.create(productData);
                        console.log(`Created product: ${productData.name}`);
                }

                console.log('Seeding completed successfully.');
                process.exit(0);
        } catch (error) {
                console.error('Error seeding products:', error);
                process.exit(1);
        }
};

seedProducts();
