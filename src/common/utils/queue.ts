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
        }
};
