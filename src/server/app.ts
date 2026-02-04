if (process.env.NODE_ENV === 'production') require('module-alias/register');

import hpp from 'hpp';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
// import helmetCsp from 'helmet-csp';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet, { HelmetOptions } from 'helmet';
import express, { Application, NextFunction, Request, Response } from 'express';

import { errorHandler } from '@/controller';
import { ALLOWED_ORIGINS, ENVIRONMENT, stopRedisConnections, redisClient } from '@/config';
import { fifteenMinutes, logger, stopQueueWorkers, stream } from '@/common';
import {
        setCsrfToken,
        csrfProtection,
        timeoutMiddleware,
        validateDataWithZod,
        correlationIdMiddleware,
        customSanitizer
} from '@/middleware';

import { authRouter } from '@/routes';

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
                        'x-referrer',
                        'Accept',
                        'Origin'
                ],
                exposedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
                preflightContinue: false,
                optionsSuccessStatus: 204
        })
);

/**
 * rate limiter
 */

app.use(
        rateLimit({
                windowMs: fifteenMinutes,
                max: ENVIRONMENT.APP.ENV === 'development' ? 1000 : 100,
                message: 'Too many requests from this IP, please try again later!'
        })
);

/**
 * use Helmet middleware for security headers
 */

app.use(
        helmet({
                contentSecurityPolicy: {
                        directives: {
                                baseUri: ["'self'"],
                                objectSrc: ["'none'"],
                                defaultSrc: ["'self'"],
                                frameAncestors: ["'none'"],
                                upgradeInsecureRequests: [],
                                imgSrc: ["'self'", 'data:', 'https:'],
                                styleSrc: ["'self'", "'unsafe-inline'"],
                                scriptSrc: ["'self'", "'unsafe-inline'"],
                                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                                connectSrc: ["'self'", 'https://api.mapbox.com', ENVIRONMENT.FRONTEND_URL],
                                frameSrc: ["'self'"],
                                mediaSrc: ["'self'"],
                                childSrc: ["'self'"],
                                reportUri: '/csp-report'
                        }
                },
                frameguard: { action: 'deny' },
                referrerPolicy: { policy: 'same-origin' },
                hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
                noSniff: true,
                dnsPrefetchControl: { allow: false },
                permittedCrossDomainPolicies: { permittedPolicies: 'none' }
        })
);

/**
 * additional security headers
 */
app.use((req, res, next) => {
        // prevent browser from caching sensitive info.
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        // remove server info.
        res.removeHeader('X-Powered-By');

        next();
});

// in-place sanitization for Express 5 compatibility (replaces mongoSanitize and xss)
app.use(customSanitizer);

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

app.get('/api/v1/health', async (req: Request, res: Response) => {
        const mongoStatus = mongoose.connection.readyState === 1 ? 'up' : 'down';
        let redisStatus = 'down';

        try {
                if (redisClient && (await redisClient.ping()) === 'PONG') {
                        redisStatus = 'up';
                }
        } catch (error) {
                logger.error(`Redis health check failed: ${error}`);
        }

        const status = mongoStatus === 'up' && redisStatus === 'up' ? 200 : 503;

        res.status(status).json({
                status: status === 200 ? 'success' : 'error',
                message: 'System health status',
                data: {
                        mongodb: mongoStatus,
                        redis: redisStatus,
                        timestamp: new Date().toISOString()
                }
        });
});

app.use('/api/v1/alive', (req: Request, res: Response) => {
        res.status(200).json({
                status: 'success',
                message: 'Server is alive',
                data: {
                        requestTime: req.requestTime
                }
        });
});
app.use('/api/v1/auth', authRouter);
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
