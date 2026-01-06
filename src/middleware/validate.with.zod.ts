import * as z from 'zod';
import { NextFunction, Request, Response } from 'express';

import { catchAsync } from './catch.async';
import { mainSchema, partialMainSchema } from '@/schema';
import { sanitizeRequestBody } from '@/common';
import AppError from '@/common/utils/app.error';

type MyDataShape = z.infer<typeof mainSchema>;

const methodsToSkipValidation = ['GET'];

const validateDataWithZod = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
      // skip validation for defined methods and routes
      if (methodsToSkipValidation.includes(req.method)) {
            return next();
      }

      const rawData = req.body as Partial<MyDataShape>;

      if (!rawData) return next();

      // Sanitize input data first
      const sanitizedData = sanitizeRequestBody(rawData) as Partial<MyDataShape>;

      // Validate only if it contains the fields in req.body against the mainSchema
      const mainResult = partialMainSchema.safeParse(sanitizedData);
      if (!mainResult.success) {
            const errorDetails = mainResult.error;
            throw new AppError('Validation failed', 422, errorDetails);
      } else {
            // this ensures that only fields defined in the mainSchema are passed to the req.body
            req.body = mainResult.data as Partial<MyDataShape>;
      }

      next();
});

export { validateDataWithZod };
