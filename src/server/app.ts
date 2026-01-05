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
const allowedOrigins = [ENVIRONMENT.FRONTEND_URL];

/**
 * security configuration
 */

app.use(helmet());
app.use(helmetCsp());
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

const app: Application = express();
