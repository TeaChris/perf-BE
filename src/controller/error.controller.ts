import { logger } from '@/common';
import { ENVIRONMENT } from '@/config';
import AppError from '@/common/utils/app.error';

import { CastError, Error as MongooseError } from 'mongoose';
import { Request, Response, NextFunction } from 'express';

const handleMongooseCastError = (err: CastError) => {
      const message = `Invalid ${err.path} value ${err.value}`;
      return new AppError(message, 400);
};

const handleMongooseValidationError = (err: MongooseError.ValidationError) => {
      const errors = Object.values(err.errors).map((val: any) => val.message);
      const message = `Invalid input data. ${errors.join(', ')}`;
      return new AppError(message, 400);
};

const handleMongooseDuplicateFieldsError = (err, next: NextFunction) => {
      logger.error('Unhandled error:', err);

      if (err.code === 11000) {
            const field = Object.keys(err.keyValue || {})[0]
                  .replace(/([a-z])([A-Z])/g, '$1 $2')
                  .split(/(?=[A-Z])/)
                  .map((word, index) =>
                        index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()
                  )
                  .join('');

            const value = err.keyValue[field];
            const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists with value ${value}`;
            return new AppError(message, 409);
      } else {
            next(err);
      }
};

const handleJWTExpiredError = () => {
      return new AppError('Token expired', 401);
};

const handleJWTError = () => {
      return new AppError('Invalid token. Please log in again!', 401);
};

const handleTimeoutError = () => {
      return new AppError('Request timed out', 408);
};

const sendErrorDev = (err: AppError, res: Response) => {
      res.status(err.statusCode).json({
            error: err,
            stack: err.stack,
            status: err.status,
            message: err.message
      });
};

const sendErrorProd = (err: AppError, res: Response) => {
      if (err?.isOperational) {
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

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
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
            if ((err as MongooseError) && err.code === 11000) error = handleMongooseDuplicateFieldsError(err, next);

            sendErrorProd(error, res);
      }
};

export { errorHandler };
