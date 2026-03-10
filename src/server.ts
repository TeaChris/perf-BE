import http from 'http';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { Server } from 'socket.io';

import { db } from './db';
import app from './server/app';
import { ALLOWED_ORIGINS, ENVIRONMENT, stopRedisConnections } from '@/config';
import { logger, startQueueWorkers, stopQueueWorkers } from './common';

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

        // Start BullMQ workers — this also schedules the repeatable maintenance jobs
        // (expired-purchase-cleanup every 2 min, flash-sale-sync every 3 min).
        // These replace the previous setInterval loops.
        await startQueueWorkers();

        logger.info(`🚀 ${appName} is listening on port ${port}`);
});

/**
 * unhandledRejection handler
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
