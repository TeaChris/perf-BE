import { Resend } from 'resend';

import { welcomeEmail } from '../template';
import { ENVIRONMENT } from '../environment';
import { EmailJobData, logger } from '@/common';

const resend = new Resend(ENVIRONMENT.EMAIL.API_KEY);

if (!resend) logger.error('Resend Api Key Needed');

const TEMPLATE = {
        welcomeEmail: {
                subject: 'Welcome to our platform',
                template: welcomeEmail,
                from: ENVIRONMENT.EMAIL.FROM_EMAIL
        }
};

const sendEmail = async (job: EmailJobData) => {
        const { type, data } = job as EmailJobData;

        const options = TEMPLATE[type];

        if (!options) {
                logger.error('Email template not found');
                return;
        }

        logger.info('options', options);
        logger.info('job send email', job);
        logger.info(options.template(data));

        try {
                const dispatch = await resend.emails.send({
                        to: data.to,
                        from: options.from,
                        subject: options.subject,
                        html: options.template(data)
                });

                logger.info('dispatch', dispatch);
                logger.info(`Resend api successfully delivered ${type} email to ${data.to}`);
        } catch (error) {
                logger.error('error', error);
                logger.error(`Resend api failed to deliver ${type} email to ${data.to}` + error);
        }
};

export { sendEmail };
