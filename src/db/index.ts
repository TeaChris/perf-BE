import mongoose, { ConnectOptions } from 'mongoose';

import { ENVIRONMENT } from '@/config';
import { logger } from '@/common';

interface CustomConnectOptions extends ConnectOptions {
      maxPoolSize?: number;
      minPoolSize?: number;
}

const db = async (): Promise<void> => {
      try {
            const conn = await mongoose.connect(ENVIRONMENT.DB.URL, {
                  maxPoolSize: 10,
                  minPoolSize: 2
            } as CustomConnectOptions);
            logger.info(`Database connected successfully: ${conn.connection.host}`);
      } catch (error) {
            logger.error(`Database connection failed: ${error}`);
            process.exit(1);
      }
};

export { db };
