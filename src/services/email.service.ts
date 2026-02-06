import { Resend } from 'resend';
import { ENVIRONMENT } from '../config';
import { logger } from '../common';

class EmailService {
        private resend: Resend;

        constructor() {
                this.resend = new Resend(ENVIRONMENT.EMAIL.API_KEY);
        }

        async sendVerificationEmail(to: string, username: string, token: string) {
                const verificationUrl = `${ENVIRONMENT.FRONTEND_URL}/verify-email?token=${token}`;

                try {
                        const { data, error } = await this.resend.emails.send({
                                from: `FlashRush <${ENVIRONMENT.EMAIL.FROM_EMAIL}>`,
                                to: [to],
                                subject: 'Verify your FlashRush account 🚀',
                                html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; padding: 40px; }
            .container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 24px; padding: 48px; border: 1px solid #1e293b; }
            .logo { font-size: 32px; font-weight: 900; color: #f97316; margin-bottom: 24px; font-style: italic; }
            h1 { font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 16px; }
            p { color: #94a3b8; line-height: 1.6; margin-bottom: 32px; }
            .button { background: linear-gradient(to right, #f97316, #dc2626); color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; display: inline-block; transition: transform 0.2s; }
            .footer { margin-top: 48px; font-size: 12px; color: #475569; border-top: 1px solid #1e293b; pt: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">FLASH<span style="color:#ffffff">RUSH</span></div>
            <h1>Hey ${username}, welcome to the rush! ⚡️</h1>
            <p>You're almost there. To start participating in our high-speed flash sales, we just need to verify your email address. It takes less than a minute.</p>
            <a href="${verificationUrl}" class="button">Verify My Email</a>
            <p style="margin-top: 32px; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:<br/>
            <span style="color: #f97316;">${verificationUrl}</span></p>
            <div class="footer">
              &copy; 2026 FlashRush. All rights reserved. <br/>
              High-performance real-time engine for global shoppers.
            </div>
          </div>
        </body>
        </html>
        `
                        });

                        if (error) {
                                logger.error('Failed to send verification email', { error });
                                return { success: false, error };
                        }

                        return { success: true, data };
                } catch (err) {
                        logger.error('Email service error', { err });
                        return { success: false, error: err };
                }
        }
}

export const emailService = new EmailService();
