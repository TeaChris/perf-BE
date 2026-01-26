import mongoose, { ConnectOptions } from 'mongoose';

import { ENVIRONMENT } from '@/config';
import { logger } from '@/common';

interface CustomConnectOptions extends ConnectOptions {
        maxPoolSize?: number;
        minPoolSize?: number;
}

const db = async (): Promise<void> => {
        const connectionOptions: CustomConnectOptions = {
                maxPoolSize: 10,
                minPoolSize: 2,
                socketTimeoutMS: 45000,
                serverSelectionTimeoutMS: 5000,
                heartbeatFrequencyMS: 10000
        };

        mongoose.connection.on('connected', () => {
                logger.info('Mongoose connected to DB');
        });

        mongoose.connection.on('error', err => {
                logger.error(`Mongoose connection error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
                logger.warn('Mongoose disconnected');
        });

        mongoose.connection.on('reconnected', () => {
                logger.info('Mongoose reconnected');
        });

        process.on('SIGINT', async () => {
                await mongoose.connection.close();
                logger.info('Mongoose connection closed through app termination');
                process.exit(0);
        });

        try {
                const conn = await mongoose.connect(ENVIRONMENT.DB.URL, connectionOptions);
                logger.info(`Database initial connection successful: ${conn.connection.host}`);
        } catch (error) {
                logger.error(`Database initial connection failed: ${error}`);
                // We don't exit here to allow Mongoose to attempt reconnection if configured,
                // but for initial start, it might be better to exit if DB is essential.
                // Given the requirement for "automatic reconnection logic", Mongoose handles
                // this after the first successful connection.
                process.exit(1);
        }
};

export { db };
