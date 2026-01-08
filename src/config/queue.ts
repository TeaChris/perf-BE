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
