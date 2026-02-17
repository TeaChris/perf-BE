import { logger } from '@/common';
import { ENVIRONMENT } from '@/config';
import AppError from '@/common/utils/app.error';

import { CastError, Error as MongooseError } from 'mongoose';
import { Request, Response, NextFunction } from 'express';

const handleMongooseCastError = (err: CastError): AppError => {
        const message = `Invalid ${err.path} value ${err.value}`;
        return new AppError(message, 400);
};

const handleMongooseValidationError = (err: MongooseError.ValidationError): AppError => {
        const errors = Object.values(err.errors).map(
                val => (val as MongooseError.ValidatorError | MongooseError.CastError).message
        );
        const message = `Invalid input data. ${errors.join(', ')}`;
        return new AppError(message, 400);
};

const handleMongooseDuplicateFieldsError = (
        err: MongooseError & { keyValue?: Record<string, unknown>; code?: number }
): AppError => {
        logger.error('Unhandled error:', err);

        const keyValue = err.keyValue || {};
        const field = Object.keys(keyValue)[0]
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .split(/(?=[A-Z])/)
                .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
                .join('');

        const value = keyValue[field] || 'unknown';
        const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists with value ${value}`;
        return new AppError(message, 409);
};

const handleJWTExpiredError = (): AppError => {
        return new AppError('Token expired', 401);
};

const handleJWTError = (): AppError => {
        return new AppError('Invalid token. Please log in again!', 401);
};

const handleTimeoutError = (): AppError => {
        return new AppError('Request timed out', 408);
};

const sendErrorDev = (err: AppError, res: Response): void => {
        res.status(err.statusCode).json({
                error: err,
                stack: err.stack,
                status: err.status,
                message: err.message
        });
};

const sendErrorProd = (err: AppError, res: Response): void => {
        if (err && err.isOperational) {
                logger.error(`Operational error:`, err.message);
                res.status(err.statusCode).json({
                        status: err.status,
                        message: err.message,
                        error: err
                });
        } else {
                logger.error(`Non-operational error:`, err.message);
                res.status(500).json({
                        status: 'error',
                        message: 'Something went very wrong!'
                });
        }
};

const errorHandler = (
        err: AppError & { code?: number; name?: string; timeout?: boolean },
        req: Request,
        res: Response,
        next: NextFunction
): void => {
        err.statusCode = err.statusCode || 500;
        err.status = err.status || 'Error';

        if (ENVIRONMENT.APP.ENV === 'development') {
                logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
                sendErrorDev(err, res);
        } else {
                let error = err;
                if (err instanceof MongooseError.CastError) error = handleMongooseCastError(err);
                else if (err instanceof MongooseError.ValidationError) error = handleMongooseValidationError(err);
                if ('timeout' in err && err.timeout) error = handleTimeoutError();
                if (err.name === 'JsonWebTokenError') error = handleJWTError();
                if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
                if ('code' in err && err.code === 11000) {
                        error = handleMongooseDuplicateFieldsError(
                                err as MongooseError & { keyValue?: Record<string, unknown>; code?: number }
                        );
                }

                sendErrorProd(error, res);
        }
};

export { errorHandler };
