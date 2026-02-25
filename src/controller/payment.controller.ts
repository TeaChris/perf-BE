import crypto from 'crypto';
import { Request, Response } from 'express';

import { Purchase, FlashSale, Product } from '../model';
import { paystackService } from '../services';
import { catchAsync } from '../middleware';
import { ENVIRONMENT } from '../config';
import { logger } from '../common';
import { io } from '../server';

/**
 * @desc    Handle Paystack Webhook
 * @route   POST /api/v1/payments/webhook
 * @access  Public
 */
export const handleWebhook = catchAsync(async (req: Request, res: Response) => {
        const hash = crypto
                .createHmac('sha512', ENVIRONMENT.PAYSTACK.SECRET_KEY)
                .update(JSON.stringify(req.body))
                .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
                logger.warn('Invalid Paystack signature received');
                return res.status(400).json({ status: 'error', message: 'Invalid signature' });
        }

        const event = req.body;

        if (event.event === 'charge.success') {
                const { reference, metadata } = event.data;
                const purchase = await Purchase.findOne({ paymentReference: reference });

                if (purchase && purchase.status === 'pending') {
                        purchase.status = 'completed';
                        purchase.purchasedAt = new Date();
                        await purchase.save();

                        // Emit real-time purchase confirmation to the user
                        io.to(`user_${purchase.userId}`).emit('payment_success', {
                                purchaseId: purchase._id,
                                productId: purchase.productId
                        });

                        // Emit real-time purchase feed update
                        io.to(`sale_${purchase.flashSaleId}`).emit('new_purchase', {
                                username: metadata?.username || 'Buyer',
                                purchasedAt: purchase.purchasedAt
                        });
                }
        } else if (event.event === 'charge.failed' || event.event === 'transfer.failed') {
                const { reference } = event.data;
                const purchase = await Purchase.findOne({ paymentReference: reference });

                if (purchase && purchase.status === 'pending') {
                        purchase.status = 'failed';
                        await purchase.save();

                        // Return stock to the flash sale
                        const flashSale = await FlashSale.findOneAndUpdate(
                                { _id: purchase.flashSaleId, 'products.productId': purchase.productId },
                                { $inc: { 'products.$.stockRemaining': 1 } },
                                { new: true }
                        );

                        if (flashSale) {
                                // Emit stock update
                                const productIndex = flashSale.products.findIndex(
                                        p => p.productId.toString() === purchase.productId.toString()
                                );
                                if (productIndex !== -1) {
                                        io.to(`sale_${purchase.flashSaleId}`).emit('stock_update', {
                                                productId: purchase.productId,
                                                remainingStock: flashSale.products[productIndex].stockRemaining
                                        });
                                }
                        }

                        io.to(`user_${purchase.userId}`).emit('payment_failed', {
                                reference,
                                reason: 'Payment failed'
                        });
                }
        }

        res.status(200).json({ status: 'success' });
});

/**
 * @desc    Verify payment status (Polling fallback for frontend)
 * @route   GET /api/v1/payments/verify/:reference
 * @access  Private
 */
export const verifyPayment = catchAsync(async (req: Request, res: Response) => {
        const { reference } = req.params;
        const purchase = await Purchase.findOne({ paymentReference: reference });

        if (!purchase) {
                return res.status(404).json({ status: 'error', message: 'Purchase not found' });
        }

        if (purchase.status === 'completed') {
                return res.status(200).json({ status: 'success', data: { status: 'completed', purchase } });
        }

        // Pulse verification with Paystack
        const result = await paystackService.verifyTransaction(reference as string);

        if (result && result.data.status === 'success') {
                purchase.status = 'completed';
                purchase.purchasedAt = new Date();
                await purchase.save();
                return res.status(200).json({ status: 'success', data: { status: 'completed', purchase } });
        }

        res.status(200).json({
                status: 'success',
                data: { status: purchase.status }
        });
});
