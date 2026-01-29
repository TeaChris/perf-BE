import * as z from 'zod';
import { NextFunction, Request, Response } from 'express';

import { catchAsync } from './catch.async';
import { sanitizeRequestBody } from '../common';
import AppError from '../common/utils/app.error';
import { mainSchema, partialMainSchema } from '../schema';

type MyDataShape = z.infer<typeof mainSchema>;

const methodsToSkipValidation = ['GET'];

const validateDataWithZod = (schema?: z.ZodSchema) =>
        catchAsync(async (req: Request, res: Response, next: NextFunction) => {
                // skip validation for defined methods and routes
                if (methodsToSkipValidation.includes(req.method)) {
                        return next();
                }

                const rawData = req.body;

                if (!rawData) return next();

                // Sanitize input data first
                const sanitizedData = sanitizeRequestBody(rawData);

                // If a specific schema is provided, use it. Otherwise, use the legacy global logic.
                const targetSchema = schema || partialMainSchema;

                const result = targetSchema.safeParse(sanitizedData);
                if (!result.success) {
                        const errorDetails = result.error;
                        throw new AppError('Validation failed', 422, errorDetails);
                } else {
                        // this ensures that only fields defined in the schema are passed to the req.body
                        req.body = result.data;
                }

                next();
        });

export { validateDataWithZod };
