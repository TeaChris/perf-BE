import { Queue, Worker, QueueEvents, Job } from 'bullmq';

import { EmailJobData, logger } from '@/common';
import { createRedisClient } from './redis';

// Map to store queues by name
const queues = new Map<string, Queue>();

// Map to store workers by queue name
const workers = new Map<string, Worker>();

// Map to store queue events by queue name
const queueEvents = new Map<string, QueueEvents>();

/**
 * Get or create a queue
 * @param queueName - The name of the queue
 * @returns The queue instance or null if Redis is not configured
 */

export const getQueue = (queueName: string): Queue | null => {
        // check if queue exists
        if (!queues.has(queueName)) {
                return queues.get(queueName) || null;
        }

        // get redis connection options
        const connectionOptions = createRedisClient();
        if (!connectionOptions) {
                logger.error('Redis is not configured');
                return null;
        }

        try {
                // create a new queue
                const queue = new Queue(queueName, {
                        defaultJobOptions: {
                                attempts: 2,
                                backoff: {
                                        type: 'exponential',
                                        delay: 1000
                                },
                                removeOnComplete: 100, // keep only 100 completed jobs
                                removeOnFail: 200 // keep only 200 failed jobs
                        },
                        connection: connectionOptions
                });

                // store queue in map
                queues.set(queueName, queue);

                // create queue events
                const events = new QueueEvents(queueName, { connection: connectionOptions });
                queueEvents.set(queueName, events);

                // set up event listeners
                events.on('completed', ({ jobId }) => {
                        logger.info(`Job ${jobId} completed in queue ${queueName}`);
                });

                events.on('error', error => {
                        logger.error(`Queue events error in ${queueName}:`, error);
                });

                events.on('failed', ({ jobId, failedReason }) => {
                        logger.info(`Job ${jobId} failed in queue ${queueName} with reason: ${failedReason}`);
                });

                return queue;
        } catch (error) {
                logger.error(`Error creating queue ${queueName}:`, error);
                return null;
        }
};

/**
 * Add a job to a queue
 * @param queueName - The name of the queue
 * @param jobData - The job data
 * @param options - Job options (optional)
 * @returns The job ID or a fake job ID if Redis is not configured
 */
