import { ENVIRONMENT } from '../config';
import { logger } from '../common';

export interface PaystackInitializeResponse {
        status: boolean;
        message: string;
        data: {
                authorization_url: string;
                access_code: string;
                reference: string;
        };
}

export interface PaystackVerifyResponse {
        status: boolean;
        message: string;
        data: {
                id: number;
                domain: string;
                status: string;
                reference: string;
                amount: number;
                gateway_response: string;
                paid_at: string;
                created_at: string;
                channel: string;
                currency: string;
                ip_address: string;
                metadata: any;
                customer: {
                        id: number;
                        first_name: string;
                        last_name: string;
                        email: string;
                        customer_code: string;
                        phone: string | null;
                        metadata: any;
                        risk_action: string;
                };
        };
}

class PaystackService {
        private readonly secretKey: string;
        private readonly baseUrl: string = 'https://api.paystack.co';

        constructor() {
                this.secretKey = ENVIRONMENT.PAYSTACK.SECRET_KEY;
        }

        /**
         * Initialize a transaction
         */
        async initializeTransaction(
                email: string,
                amount: number,
                reference: string,
                metadata: any = {}
        ): Promise<PaystackInitializeResponse | null> {
                try {
                        const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
                                method: 'POST',
                                headers: {
                                        Authorization: `Bearer ${this.secretKey}`,
                                        'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                        email,
                                        amount: amount * 100, // Paystack amount is in kobo
                                        reference,
                                        callback_url: ENVIRONMENT.PAYSTACK.CALLBACK_URL,
                                        metadata
                                })
                        });

                        const result = (await response.json()) as PaystackInitializeResponse;

                        if (!result.status) {
                                logger.error('Paystack initialization failed', { result });
                                return null;
                        }

                        return result;
                } catch (error) {
                        logger.error('Paystack service error (initialize)', { error });
                        return null;
                }
        }

        /**
         * Verify a transaction
         */
        async verifyTransaction(reference: string): Promise<PaystackVerifyResponse | null> {
                try {
                        const response = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
                                method: 'GET',
                                headers: {
                                        Authorization: `Bearer ${this.secretKey}`
                                }
                        });

                        const result = (await response.json()) as PaystackVerifyResponse;

                        if (!result.status) {
                                logger.error('Paystack verification failed', { result });
                                return null;
                        }

                        return result;
                } catch (error) {
                        logger.error('Paystack service error (verify)', { error });
                        return null;
                }
        }
}

export const paystackService = new PaystackService();
