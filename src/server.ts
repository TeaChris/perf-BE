import http from 'http';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { Server } from 'socket.io';

import { db } from './db';
import app from './server/app';
import { ALLOWED_ORIGINS, ENVIRONMENT, stopRedisConnections } from '@/config';
import { logger, startQueueWorkers, stopQueueWorkers } from './common';
import { Purchase, FlashSale, Asset } from './model';

const port = ENVIRONMENT.APP.PORT;
const appName = ENVIRONMENT.APP.NAME;

const server = http.createServer(app);

// Initialize Socket.io
export const io = new Server(server, {
        cors: {
                origin: ALLOWED_ORIGINS,
                credentials: true
        }
});

// Socket.IO authentication middleware — verify JWT from cookies
io.use((socket, next) => {
        try {
                const rawCookie = socket.handshake.headers.cookie;
                if (!rawCookie) {
                        return next(new Error('Authentication required'));
                }

                const cookies = cookie.parse(rawCookie);
                const token = cookies.perfAccessToken;

                if (!token) {
                        return next(new Error('Authentication required'));
                }

                const decoded = jwt.verify(token, ENVIRONMENT.JWT.ACCESS_KEY, {
                        issuer: ENVIRONMENT.APP.NAME,
                        audience: ENVIRONMENT.APP.CLIENT
                }) as { id: string; version: number; jti?: string };

                // Attach user info to socket for later use
                socket.data.userId = decoded.id;
                next();
        } catch {
                next(new Error('Invalid or expired token'));
        }
});

io.on('connection', socket => {
        logger.info(`🔌 Client connected: ${socket.id} (user: ${socket.data.userId})`);

        socket.on('join_sale', (saleId: string) => {
                socket.join(`sale_${saleId}`);
                logger.info(`👥 Client ${socket.id} joined sale: ${saleId}`);
        });

        socket.on('join_user_room', (roomId: string) => {
                // Only allow joining the user's own room
                const expectedRoom = `user_${socket.data.userId}`;
                if (roomId !== expectedRoom) {
                        logger.warn(`⚠️ Client ${socket.id} tried to join unauthorized room: ${roomId}`);
                        return;
                }
                socket.join(roomId);
                logger.info(`👤 Client ${socket.id} joined user room: ${roomId}`);
        });

        socket.on('disconnect', () => {
                logger.info(`🔌 Client disconnected: ${socket.id}`);
        });
});

const appServer = server.listen(port, async () => {
        await db();

        await startQueueWorkers();

        // Expired purchase cleanup — runs every 2 minutes
        const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;
        setInterval(async () => {
                try {
                        const now = new Date();
                        const expiredPurchases = await Purchase.find({
                                status: 'pending',
                                expiresAt: { $lt: now }
                        });

                        for (const purchase of expiredPurchases) {
                                purchase.status = 'expired';
                                await purchase.save();

                                // Return stock to flash sale
                                const flashSale = await FlashSale.findOneAndUpdate(
                                        { _id: purchase.flashSaleId, 'assets.assetId': purchase.assetId },
                                        { $inc: { 'assets.$.stockRemaining': 1 } },
                                        { new: true }
                                );

                                if (flashSale) {
                                        const saleAsset = flashSale.assets.find(
                                                a => a.assetId.toString() === purchase.assetId.toString()
                                        );
                                        if (saleAsset) {
                                                io.to(`sale_${purchase.flashSaleId}`).emit('stock_update', {
                                                        assetId: purchase.assetId,
                                                        remainingStock: saleAsset.stockRemaining
                                                });
                                        }
                                }

                                io.to(`user_${purchase.userId}`).emit('payment_failed', {
                                        reference: purchase.paymentReference,
                                        reason: 'Payment reservation expired'
                                });
                        }

                        if (expiredPurchases.length > 0) {
                                logger.info(`🧹 Cleaned up ${expiredPurchases.length} expired purchase(s)`);
                        }
                } catch (error) {
                        logger.error('Error during expired purchase cleanup:', error);
                }
        }, CLEANUP_INTERVAL_MS);

        // Flash sale status sync — runs every 3 minutes
        // Transitions expired scheduled/active sales to 'ended' and returns stock
        const SYNC_INTERVAL_MS = 3 * 60 * 1000;
        setInterval(async () => {
                try {
                        const now = new Date();
                        const expiredSales = await FlashSale.find({
                                status: { $in: ['scheduled', 'active'] },
                                endTime: { $lt: now }
                        });

                        for (const sale of expiredSales) {
                                for (const a of sale.assets) {
                                        if (a.stockRemaining > 0) {
                                                await Asset.findByIdAndUpdate(a.assetId, {
                                                        $inc: { stock: a.stockRemaining }
                                                });
                                        }
                                }
                                sale.status = 'ended';
                                sale.isActive = false;
                                await sale.save();
                        }

                        if (expiredSales.length > 0) {
                                logger.info(`⏰ Synchronized ${expiredSales.length} flash sale(s) to 'ended' status`);
                        }
                } catch (error) {
                        logger.error('Error during flash sale status sync:', error);
                }
        }, SYNC_INTERVAL_MS);

        logger.info(`🚀 ${appName} is listening on port ${port}`);
});

/**
 * unhandledRejection  handler
 */

process.on('unhandledRejection', async (error: Error) => {
        console.log('UNHANDLED REJECTION! 💥 Server Shutting down...');
        console.log(error.name, error.message);
        logger.error(`UNHANDLED REJECTION! 💥 Server Shutting down... [${new Date().toISOString()}]`, {
                error
        });

        await stopRedisConnections();
        await stopQueueWorkers();

        appServer.close(() => {
                logger.info('HTTP server closed');
                process.exit(1);
        });
});

/**
 * Handle SIGTERM signal
 */

process.on('SIGTERM', () => {
        logger.info('SIGTERM signal received: closing HTTP server gracefully');

        stopRedisConnections();
        stopQueueWorkers();

        appServer.close(() => {
                logger.info('HTTP server closed');
                process.exit(0);
        });
});
