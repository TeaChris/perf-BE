import Redis from 'ioredis';

import { ENVIRONMENT } from './environment';
import { logger } from '@/common';

export const createRedisClient = (): Redis | null => {
        try {
                const redisUrl = ENVIRONMENT.REDIS.URL;

                if (!redisUrl) {
                        logger.warn('Redis URL is not configured. Redis functionality will not be available.');
                        return null;
                }

                const redisClient = new Redis(redisUrl, {
                        tls: {
                                rejectUnauthorized: true
                        },
                        maxRetriesPerRequest: null,
                        enableOfflineQueue: true,

                        retryStrategy: times => {
                                const delay = Math.min(times * 50, 2000);
                                return delay;
                        }
                });

                redisClient.on('connect', () => {
                        logger.info('✅ Redis client connected');
                });

                redisClient.on('error', error => {
                        logger.error('❌ Redis client error:', error);
                });

                redisClient.on('reconnecting', () => {
                        logger.info('🔄 Reconnecting to Redis...');
                });

                redisClient.on('end', () => {
                        logger.info('❌ Redis client disconnected');
                });

                return redisClient;
        } catch (error) {
                logger.error('❌ Redis client error:', error);
                return null;
        }
};

export const createCacheClient = (): Redis | null => {
        try {
                const cacheUrl = ENVIRONMENT.CACHE_REDIS.URL;
                const cachedPassword = ENVIRONMENT.REDIS.PASSWORD;

                if (!cacheUrl) {
                        logger.warn(
                                'Cache Redis URL is not configured. Cache Redis functionality will not be available.'
                        );
                        return null;
                }

                let client: Redis;

                if (cacheUrl.startsWith('https://')) {
                        logger.info('Using Upstash Redis connection string for cache');
                        const connectionString = `redis://${cachedPassword}@${cacheUrl.replace('https://', '')}`;

                        client = new Redis(connectionString, {
                                tls: {
                                        rejectUnauthorized: true
                                },
                                maxRetriesPerRequest: 3,
                                enableOfflineQueue: false,

                                retryStrategy: times => {
                                        const delay = Math.min(times * 50, 2000);
                                        return delay;
                                }
                        });
                } else {
                        client = new Redis(cacheUrl, {
                                password: cachedPassword,
                                maxRetriesPerRequest: 3,
                                enableOfflineQueue: false,

                                retryStrategy: times => {
                                        const delay = Math.min(times * 50, 2000);
                                        return delay;
                                }
                        });
                }

                client.on('connect', () => {
                        logger.info('✅ Redis cache client connected');
                });

                client.on('error', error => {
                        logger.error('❌ Redis cache client error:', error);
                });

                client.on('reconnecting', () => {
                        logger.info('🔄 Reconnecting to Redis cache client...');
                });

                client.on('end', () => {
                        logger.info('❌ Redis cache client disconnected');
                });

                return client;
        } catch (error) {
                logger.error('❌ Failed to create redis cache client:', error);
                return null;
        }
};

export const redisClient = createRedisClient();
export const cacheClient = createCacheClient();

export const redis = {
        /**
         * Set a value in the cache
         * @param key - The cache key
         * @param value - The value to cache
         * @param ttl - Time to live in seconds (optional)
         */

        async set<T>(key: string, value: T, ttl?: number): Promise<void> {
                if (!cacheClient) {
                        logger.debug(`Cache disabled: skipping set operation for key ${key}`);
                        return;
                }

                try {
                        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                        if (ttl) {
                                await cacheClient.set(key, stringValue, 'EX', ttl);
                        } else {
                                await cacheClient.set(key, stringValue);
                        }
                } catch (error) {
                        logger.error(`Error setting cache for key ${key}:`, error);
                }
        },

        /**
         * Get a value from the cache
         * @param key - The cache key
         * @param parse - Whether to parse the result as JSON (default: true)
         */
        async get<T = unknown>(key: string, parse = true): Promise<T | null> {
                if (!cacheClient) {
                        logger.debug(`Cache disabled: skipping get operation for key ${key}`);
                        return null;
                }

                try {
                        const value = await cacheClient.get(key);
                        if (!value) return null;
                        return (parse ? JSON.parse(value) : value) as T;
                } catch (error) {
                        logger.error(`Error getting cache for key ${key}:`, error);
                        return null;
                }
        },

        /**
         * Delete a value from the cache
         * @param key - The cache key
         */
        async del(key: string): Promise<void> {
                if (!cacheClient) {
                        logger.debug(`Cache disabled: skipping delete operation for key ${key}`);
                        return;
                }

                try {
                        await cacheClient.del(key);
                } catch (error) {
                        logger.error(`Error deleting cache for key ${key}:`, error);
                }
        },

        /**
         * Clear all values from the cache
         */
        async clear(): Promise<void> {
                if (!cacheClient) {
                        logger.debug('Cache disabled: skipping clear operation');
                        return;
                }

                try {
                        await cacheClient.flushall();
                } catch (error) {
                        logger.error('Error clearing cache:', error);
                }
        }
};

// Function to gracefully shut down Redis connections
export const stopRedisConnections = async (): Promise<void> => {
        try {
                // Close Redis client if it exists
                if (redisClient) {
                        await redisClient.quit();
                        logger.info('Redis client connection closed');
                }

                // Close Cache client if it exists
                if (cacheClient) {
                        await cacheClient.quit();
                        logger.info('Redis cache client connection closed');
                }

                if (!redisClient && !cacheClient) {
                        logger.info('No Redis connections to close');
                }
        } catch (error) {
                logger.error('Error closing Redis connections:', error);
        }
};
