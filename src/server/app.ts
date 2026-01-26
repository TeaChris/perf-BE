if (process.env.NODE_ENV === 'production') require('module-alias/register');

import hpp from 'hpp';
import cors from 'cors';
import morgan from 'morgan';
import xss from 'xss-clean';
import helmetCsp from 'helmet-csp';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet, { HelmetOptions } from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import express, { Application, NextFunction, Request, Response } from 'express';

import { errorHandler } from '@/controller';
import { ALLOWED_ORIGINS, ENVIRONMENT, stopRedisConnections } from '@/config';
import { fifteenMinutes, logger, stopQueueWorkers, stream } from '@/common';
import {
        setCsrfToken,
        csrfProtection,
        timeoutMiddleware,
        validateDataWithZod,
        correlationIdMiddleware
} from '@/middleware';

/**
 * handle uncaught exceptions
 */

process.on('uncaughtException', async (error: Error) => {
        console.error('UNCAUGHT EXCEPTION!! 💥 Server Shutting down...', error);
        console.log(error.name, error.message);
        logger.error('UNCAUGHT EXCEPTION!! 💥 Server Shutting down...', error);

        await stopRedisConnections();
        await stopQueueWorkers();
        process.exit(1);
});

/**
 * default app configuration
 */

const app: Application = express();

app.use(correlationIdMiddleware);

/**
 * express configuration
 */

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']); // trust proxy for ratelimit
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

/**
 * compression middleware
 */

app.use(compression());

/**
 * rate limiter
 */

app.use(
        rateLimit({
                windowMs: fifteenMinutes,
                max: 100,
                message: 'Too many requests from this IP, please try again later!'
        })
);

/**
 * middleware to allow cors
 */

app.use(
        cors({
                origin: (origin, callback) => {
                        if (!origin) return callback(null, true);

                        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
                                callback(null, true);
                        } else {
                                callback(new Error('Not allowed by CORS'));
                        }
                },
                credentials: true,
                methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
                allowedHeaders: [
                        'Content-Type',
                        'Authorization',
                        'X-Requested-With',
                        'x-xsrf-token',
                        'x-csrf-token',
                        'Accept',
                        'Origin'
                ],
                exposedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
                preflightContinue: false,
                optionsSuccessStatus: 204
        })
);

/**
 * use Helmet middleware for security headers
 */

app.use(
        helmet({
                contentSecurityPolicy: false
        })
);

app.use(
        helmetCsp({
                directives: {
                        baseUri: ['"self"'],
                        objectSrc: ['"none"'],
                        defaultSrc: ['"self"'],
                        frameAncestors: ['"none"'],
                        upgradeInsecureRequests: [],
                        imgSrc: ['"self"', 'data', 'https:'],
                        styleSrc: ['"self"', '"unsafe-inline"'],
                        scriptSrc: ['"self"', '"unsafe-inline"'],
                        fontSrc: ['"self"', 'https://fonts.gstatic.com'],
                        connectSrc: ['"self"', 'https://api.mapbox.com'],
                        frameSrc: ['"self"'],
                        mediaSrc: ['"self"'],
                        childSrc: ['"self"'],
                        reportUri: '/csp-report'
                }
        })
);

const helmetConfig: HelmetOptions = {
        frameguard: { action: 'deny' },
        xssFilter: true,
        referrerPolicy: { policy: 'same-origin' },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
};

app.use(helmet(helmetConfig));

/**
 * secure cookies and other helmet-related configurations
 */

app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());
app.use(helmet.hidePoweredBy());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.referrerPolicy());
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.permittedCrossDomainPolicies());

/**
 * additional security headers
 */
app.use((req, res, next) => {
        // prevent browser from caching sensitive info.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.set('X-Frame-Options', 'DENY');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-XSS-Protection', '1; mode=block');
        res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.set('Permissions-Policy', 'geolocation=(), microphone=()');
        res.set('Strict-Transport-Security', 'max-age=31536000 ; includeSubDomains ; preload');
        res.set(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; media-src 'self'; child-src 'self';"
        );

        // remove server info.
        res.removeHeader('X-Powered-By');

        next();
});

// data sanitization
app.use(mongoSanitize());
// data sanitization
app.use(xss());
// prevent parameter pollution
app.use(
        hpp({
                whitelist: ['data', 'createdAt']
        })
);

/**
 * logger middleware
 */

app.use(morgan(ENVIRONMENT.APP.ENV !== 'development' ? 'combined' : 'dev', { stream }));
// add request time to req object
app.use((req: Request, res: Response, next: NextFunction) => {
        req.requestTime = new Date().toISOString();
        next();
});

/**
 * Error handler middlewares
 */
app.use(timeoutMiddleware);

/**
 * Initialize routes
 */
app.use(setCsrfToken);
app.use(csrfProtection);
app.use(validateDataWithZod);

app.use('/api/v1/alive', (req: Request, res: Response) => {
        res.status(200).json({
                status: 'success',
                message: 'Server is alive',
                data: {
                        requestTime: req.requestTime
                }
        });
});

// add other routes

// 404 handler - must be after all other routes
app.use((req: Request, res: Response) => {
        logger.error('route not found' + new Date(Date.now()) + ' ' + req.originalUrl);
        res.status(404).json({
                status: 'error',
                message: `OOPs!! No handler defined for ${req.method.toUpperCase()} ${req.url}`,
                data: {
                        requestTime: req.requestTime
                }
        });
});

app.use(errorHandler);

export default app;
