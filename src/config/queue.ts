import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import Redis from 'ioredis';

import { EmailJobData, JobStatus, logger } from '@/common';
import { createRedisClient } from './redis';

// Shared Redis connection for all queues and workers (lazy singleton)
let queueConnection: Redis | null = null;

const getQueueConnection = (): Redis | null => {
        if (queueConnection) return queueConnection;
        queueConnection = createRedisClient();
        return queueConnection;
};

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
const getQueue = (queueName: string): Queue | null => {
        // Return existing queue if already created
        if (queues.has(queueName)) {
                return queues.get(queueName) || null;
        }

        // Use shared redis connection
        const connectionOptions = getQueueConnection();
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
const addJob = async (
        queueName: string,
        jobData: EmailJobData,
        options?: { delay?: number; priority?: number; attempts?: number; jobId?: string }
): Promise<string> => {
        const queue = getQueue(queueName);
        if (!queue) {
                logger.warn(`Queue disabled: cannot add job to queue ${queueName}`);
                // Return a fake job ID when Redis is not available
                return `local:${queueName}:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`;
        }

        try {
                // add job to queue
                const job = await queue.add(
                        queueName, // use queue name as job name for consistency
                        jobData,
                        {
                                delay: options?.delay,
                                priority: options?.priority,
                                attempts: options?.attempts,
                                jobId: options?.jobId || undefined
                        }
                );

                logger.info(`Job ${job?.id} added to queue ${queueName}`);
                logger.info(`Job data: ${JSON.stringify(jobData)}`);

                return (
                        (job && job.id ? job.id.toString() : undefined) ??
                        `error:${queueName}:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`
                );
        } catch (error) {
                logger.error(`Error adding job to queue ${queueName}:`, error);
                // return a fake job ID when there's an error
                return `error:${queueName}:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`;
        }
};

/**
 * Create a worker to process jobs from a queue
 * @param queueName - The name of the queue
 * @param processor - The function to process jobs
 * @param concurrency - The number of jobs to process concurrently (default: 1)
 * @returns The worker instance or null if Redis is not configured
 */
const createWorker = (
        queueName: string,
        processor: (job: Job) => Promise<unknown>,
        concurrency?: number
): Worker | null => {
        // check if worker already exists
        if (workers.has(queueName)) {
                logger.warn(`Worker already exists for queue ${queueName}`);
                return workers.get(queueName) || null;
        }

        // Use shared redis connection
        const connectionOptions = getQueueConnection();
        if (!connectionOptions) {
                logger.warn(`Queue disabled: cannot create worker for queue ${queueName}`);
                return null;
        }

        try {
                // create worker
                const worker = new Worker(
                        queueName,
                        async job => {
                                logger.info(`Processing job ${job.id} from queue ${queueName}`);
                                try {
                                        return await processor(job);
                                } catch (error) {
                                        logger.error(`Error processing job ${job.id} from queue ${queueName}:`, error);
                                        throw error; // rethrow error to let Bull handle it
                                }
                        },
                        { connection: connectionOptions, concurrency, autorun: true }
                );

                // setup event listeners
                worker.on('completed', job => {
                        logger.info(`Job ${job?.id} completed in queue ${queueName}:`);
                });

                worker.on('failed', job => {
                        logger.error(`Job ${job?.id} failed in queue ${queueName}:`, job?.failedReason);
                });

                worker.on('error', job => {
                        logger.error(`Worker error in queue ${queueName}:`, job?.cause);
                });

                // store the worker
                workers.set(queueName, worker);

                logger.info(`Worker created for queue ${queueName} with concurrency ${concurrency}`);

                return worker;
        } catch (error) {
                logger.error(`Error creating worker for queue ${queueName}:`, error);
                return null;
        }
};

/**
 * Get job status
 * @param queueName - The name of the queue
 * @param jobId - The job ID
 * @returns The job data or null if the job is not found
 */
const getJobStatus = async (queueName: string, jobId: string): Promise<JobStatus | null> => {
        const queue = getQueue(queueName);
        if (!queue) {
                logger.warn(`Queue disabled: cannot get job status ${jobId} in queue ${queueName}`);
                return null;
        }

        try {
                const job = await queue.getJob(jobId);
                if (!job) {
                        logger.warn(`Job ${jobId} not found in queue ${queueName}`);
                        return null;
                }

                // get job state
                const state = await job.getState();

                return {
                        id: job.id,
                        status: state,
                        data: job.data,
                        timestamp: job.timestamp,
                        finishedOn: job.finishedOn,
                        processedOn: job.processedOn,
                        returnvalue: job.returnvalue,
                        attemptsMade: job.attemptsMade,
                        failedReason: job.failedReason
                };
        } catch (error) {
                logger.error(`Error getting job status for ${jobId} in queue ${queueName}:`, error);
                return null;
        }
};

/**
 * Clear a queue
 * @param queueName - The name of the queue
 */
const clearQueue = async (queueName: string): Promise<void> => {
        const queue = getQueue(queueName);
        if (!queue) {
                logger.warn(`Queue disabled: cannot clear queue ${queueName}`);
                return;
        }

        try {
                // empty the queue
                await queue.obliterate({
                        force: true
                });
                logger.info(`Queue ${queueName} cleared`);
        } catch (error) {
                logger.error(`Error clearing queue ${queueName}:`, error);
        }
};

/**
 * Close all queues, workers, and queue events
 */
const closeQueueConnections = async (): Promise<void> => {
        try {
                // close all workers
                for (const [queueName, worker] of workers.entries()) {
                        await worker.close();
                        logger.info(`Worker for queue ${queueName} closed`);
                }

                workers.clear();

                // close all queue events
                for (const [queueName, events] of queueEvents.entries()) {
                        await events.close();
                        logger.info(`Queue events for queue ${queueName} closed`);
                }

                queueEvents.clear();

                // close all queues
                for (const [queueName, queue] of queues.entries()) {
                        await queue.close();
                        logger.info(`Queue ${queueName} closed`);
                }

                queues.clear();

                logger.info('All queue connections closed');
        } catch (error) {
                logger.error('Error closing queue connections:', error);
        }
};

export { addJob, createWorker, getJobStatus, clearQueue, closeQueueConnections };
