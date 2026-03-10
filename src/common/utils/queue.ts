import { Job, Queue } from 'bullmq';

import { logger } from './logger';
import { addJob, createWorker, getJobStatus, clearQueue, closeQueueConnections, sendEmail, getQueue } from '@/config';
import { EmailJobData as EmailJobDataType } from '@/common';
import { Purchase, FlashSale, Asset } from '../../model';
import { io } from '../../server';

// queue utility functions
const queueUtils = {
        /**
         * Add a job to a queue
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
         */
        async processQueue(
                queueName: string,
                processor: (jobData: EmailJobDataType) => Promise<unknown>,
                concurrency = 1
        ): Promise<void> {
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
         */
        async getJobStatus(queueName: string, jobId: string): Promise<unknown> {
                return getJobStatus(queueName, jobId);
        },

        /**
         * Clear a queue
         */
        async clearQueue(queueName: string): Promise<void> {
                return clearQueue(queueName);
        }
};

// ─────────────────────────────────────────────────────────────────────────────
// Repeatable job processors
// These replace the setInterval loops that previously lived in server.ts.
// Running inside BullMQ means the work survives restarts, is visible in the
// queue dashboard, and won't double-fire across multiple server instances.
// ─────────────────────────────────────────────────────────────────────────────

const CLEANUP_JOB_NAME = 'expired-purchase-cleanup';
const SYNC_JOB_NAME = 'flash-sale-sync';
const MAINTENANCE_QUEUE = 'maintenanceQueue';

/** Expire pending purchases whose reservation window has passed and restore stock */
async function processExpiredPurchases(_job: Job): Promise<void> {
        const now = new Date();
        const expiredPurchases = await Purchase.find({
                status: 'pending',
                expiresAt: { $lt: now }
        });

        for (const purchase of expiredPurchases) {
                purchase.status = 'expired';
                await purchase.save();

                // Return stock to flash sale
                const flashSale = await FlashSale.findOneAndUpdate(
                        { _id: purchase.flashSaleId, 'assets.assetId': purchase.assetId },
                        { $inc: { 'assets.$.stockRemaining': 1 } },
                        { new: true }
                );

                if (flashSale) {
                        const saleAsset = flashSale.assets.find(
                                a => a.assetId.toString() === purchase.assetId.toString()
                        );
                        if (saleAsset) {
                                io.to(`sale_${purchase.flashSaleId}`).emit('stock_update', {
                                        assetId: purchase.assetId,
                                        remainingStock: saleAsset.stockRemaining
                                });
                        }
                }

                io.to(`user_${purchase.userId}`).emit('payment_failed', {
                        reference: purchase.paymentReference,
                        reason: 'Payment reservation expired'
                });
        }

        if (expiredPurchases.length > 0) {
                logger.info(`🧹 [BullMQ] Cleaned up ${expiredPurchases.length} expired purchase(s)`);
        }
}

/** Transition flash sales past their endTime to 'ended' and restore remaining stock */
async function processFlashSaleSync(_job: Job): Promise<void> {
        const now = new Date();
        const expiredSales = await FlashSale.find({
                status: { $in: ['scheduled', 'active'] },
                endTime: { $lt: now }
        });

        for (const sale of expiredSales) {
                for (const a of sale.assets) {
                        if (a.stockRemaining > 0) {
                                await Asset.findByIdAndUpdate(a.assetId, {
                                        $inc: { stock: a.stockRemaining }
                                });
                        }
                }
                sale.status = 'ended';
                sale.isActive = false;
                await sale.save();
        }

        if (expiredSales.length > 0) {
                logger.info(`⏰ [BullMQ] Synchronized ${expiredSales.length} flash sale(s) to 'ended' status`);
        }
}

/**
 * Schedule a repeatable job on a queue.
 * Uses BullMQ's built-in repeat mechanism — the job is deduplicated
 * by jobId so restarts don't create duplicate schedules.
 */
async function scheduleRepeatableJob(queue: Queue, jobName: string, everyMs: number): Promise<void> {
        await queue.add(
                jobName,
                {},
                {
                        repeat: { every: everyMs },
                        jobId: `repeatable:${jobName}`,
                        removeOnComplete: 20,
                        removeOnFail: 50
                }
        );
        logger.info(`⏱ Repeatable job scheduled: "${jobName}" every ${everyMs / 1000}s`);
}

/**
 * Start queue workers for the application.
 * This function should be called when the server starts.
 */
const startQueueWorkers = async (): Promise<void> => {
        try {
                // Email queue worker
                await queueUtils.processQueue('emailQueue', sendEmail, 2);

                // Maintenance queue worker — handles both repeatable job types
                createWorker(
                        MAINTENANCE_QUEUE,
                        async (job: Job) => {
                                if (job.name === CLEANUP_JOB_NAME) {
                                        await processExpiredPurchases(job);
                                } else if (job.name === SYNC_JOB_NAME) {
                                        await processFlashSaleSync(job);
                                }
                        },
                        1
                );

                // Schedule the repeatable jobs (idempotent — BullMQ deduplicates by jobId)
                const maintenanceQueue = getQueue(MAINTENANCE_QUEUE);
                if (maintenanceQueue) {
                        await scheduleRepeatableJob(maintenanceQueue, CLEANUP_JOB_NAME, 2 * 60 * 1000); // every 2 min
                        await scheduleRepeatableJob(maintenanceQueue, SYNC_JOB_NAME, 3 * 60 * 1000); // every 3 min
                } else {
                        logger.warn(
                                'Maintenance queue unavailable — repeatable jobs not scheduled (Redis may be down)'
                        );
                }

                logger.info('✅ Queue workers started successfully');
        } catch (error) {
                logger.error('Error starting queue workers:', error);
        }
};

/**
 * Stop all queue workers and close connections.
 * This function should be called when the server shuts down.
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
