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

import { fifteenMinutes, logger, stream } from '@/common';
import { ENVIRONMENT } from '@/config';
import { timeoutMiddleware } from '@/middleware';

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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate', 'private');
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

// add request timeout protection
app.use((req: Request, res: Response, next: NextFunction) => {
      // set timeout for all requests
      const timeout = setTimeout(() => {
            next(new Error('Request timed out'));
      }, 60000);

      req.on('close', () => clearTimeout(timeout));

      next();
});

/**
 * Initialize routes
 */
app.use(validateDataWithZod);

/**
 * handle unhandled rejections
 */

process.on('unhandledRejection', (reason: any) => {
      console.error('Unhandled Rejection:', reason);
      process.exit(1);
});
