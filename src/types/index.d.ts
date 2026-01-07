declare namespace Express {
      export interface Request {
            /**
             * ISO 8601 timestamp string indicating when the request was received
             * Added by middleware in app.ts
             */
            requestTime?: string;
      }
}
