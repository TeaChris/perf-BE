import http from 'http';
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

io.on('connection', socket => {
        logger.info(`🔌 Client connected: ${socket.id}`);

        socket.on('join_sale', (saleId: string) => {
                socket.join(`sale_${saleId}`);
                logger.info(`👥 Client ${socket.id} joined sale: ${saleId}`);
        });

        socket.on('disconnect', () => {
                logger.info(`🔌 Client disconnected: ${socket.id}`);
        });
});

const appServer = server.listen(port, async () => {
        await db();

        await startQueueWorkers();

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
