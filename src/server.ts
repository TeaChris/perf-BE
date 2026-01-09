import http from 'http';

import { db } from './db';
import app from './server/app';
import { ENVIRONMENT, stopRedisConnections } from '@/config';
import { logger, startQueueWorkers, stopQueueWorkers } from './common';

const port = ENVIRONMENT.APP.PORT;
const appName = ENVIRONMENT.APP.NAME;

const server = http.createServer(app);

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
