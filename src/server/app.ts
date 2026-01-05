import * as dotenv from 'dotenv';
dotenv.config();

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

import { fifteenMinutes, logger } from '@/common';
import { ENVIRONMENT } from '@/config';

dotenv.config();

/**
 * handle uncaught exceptions
 */

process.on('uncaughtException', async (error: Error) => {
      console.error('UNCAUGHT EXCEPTION!! 💥 Server Shutting down...', error);
      console.log(error.name, error.message);
      logger.error('UNCAUGHT EXCEPTION!! 💥 Server Shutting down...', error);
      process.exit(1);

      // TODO: close redis connection
      //   TODO: stop queue workers

      process.exit(1);
});

/**
 * default app configuration
 */

const app: Application = express();

/**
 * express configuration
 */

app.use('trust proxy', ['loopback', 'linklocal', 'uniquelocal']); // trust proxy for ratelimit
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
const allowedOrigins = [
      ENVIRONMENT.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
].filter(Boolean);

app.use(
      cors({
            origin: (origin, callback) => {
                  if (!origin) return callback(null, true);

                  if (allowedOrigins.indexOf(origin) !== -1) {
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

/**
 * security configuration
 */

app.use(xss());
app.use(mongoSanitize());
app.use(hpp());
app.use(compression());

/**
 * handle unhandled rejections
 */

process.on('unhandledRejection', (reason: any) => {
      console.error('Unhandled Rejection:', reason);
      process.exit(1);
});
