import http from 'http';

import { db } from './db';
import app from './server/app';
import { logger } from './common';
import { ENVIRONMENT } from '@/config';

const port = ENVIRONMENT.APP.PORT;
const appName = ENVIRONMENT.APP.NAME;

const server = http.createServer(app);

const appServer = server.listen(port, async () => {
      //   await db();
      //TODO:   initialize redis queue worker

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

      //TODO:   close redis connection
      //TODO: stop queue workers

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

      //TODO: Close Redis connections
      //TODO: stop queue workers

      appServer.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
      });
});
