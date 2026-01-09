import { Job } from 'bullmq';

import { logger } from './logger';
import { addJob, createWorker, getJobStatus, clearQueue, closeQueueConnections, sendEmail } from '@/config';
import { EmailJobData as EmailJobDataType } from '@/common';

// queue utility functions
const queueUtils = {
        /**
         * Add a job to a queue
         * @param queueName - The name of the queue
         * @param jobData - The job data
         * @param options - Job options (optional)
         */

        async addJob(
                queueName: string,
                jobData: EmailJobDataType,
                options?: { delay?: number; priority?: number; attempts?: number; jobId?: string }
        ): Promise<string> {
                return addJob(queueName, jobData, options);
        },

        /**
         * Process jobs from a queue
         * @param queueName - The name of the queue
         * @param processor - The function to process jobs
         * @param concurrency - The number of jobs to process concurrently (default: 1)
         */

        async processQueue(
                queueName: string,
                processor: (jobData: EmailJobDataType) => Promise<unknown>,
                concurrency = 1
        ): Promise<void> {
                // create a worker to process
                // wrap the processor function to extract job data
                createWorker(
                        queueName,
                        async (job: Job) => {
                                return processor(job.data);
                        },
                        concurrency
                );
        },

        /**
         * Get job status
         * @param queueName - The name of the queue
         * @param jobId - The job ID
         */

        async getJobStatus(queueName: string, jobId: string): Promise<any> {
                return getJobStatus(queueName, jobId);
        },

        /**
         * Clear a queue
         * @param queueName - The name of the queue
         */
        async clearQueue(queueName: string): Promise<void> {
                return clearQueue(queueName);
        }
};

/**
 * Start queue workers for the application
 * This function should be called when the server starts
 */

const startQueueWorkers = async (): Promise<void> => {
        try {
                await queueUtils.processQueue('emailQueue', sendEmail, 2); // process 2 jobs at a time

                logger.info('Queue workers started successfully');
        } catch (error) {
                logger.error('Error starting queue workers:', error);
        }
};

/**
 * Stop all queue workers and close connections
 * This function should be called when the server shuts down
 */

const stopQueueWorkers = async (): Promise<void> => {
        try {
                await closeQueueConnections();
                logger.info('Queue workers stopped successfully');
        } catch (error) {
                logger.error('Error stopping queue workers:', error);
        }
};

export { stopQueueWorkers, startQueueWorkers, queueUtils };
