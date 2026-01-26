import { v4 as uuidv4 } from 'uuid';
import { context } from '@/common';
import { Request, Response, NextFunction } from 'express';

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

        // Set the correlation ID in the response headers
        res.setHeader('X-Correlation-ID', correlationId);

        // Run the rest of the request within the context
        const store = new Map();
        store.set('correlationId', correlationId);

        context.run(store, () => {
                next();
        });
};
