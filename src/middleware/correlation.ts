import { randomUUID } from 'crypto';
import { context } from '@/common';
import { Request, Response, NextFunction } from 'express';

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();

        // Set the correlation ID in the response headers
        res.setHeader('X-Correlation-ID', correlationId);

        // Run the rest of the request within the context
        const store = new Map();
        store.set('correlationId', correlationId);

        context.run(store, () => {
                next();
        });
};
