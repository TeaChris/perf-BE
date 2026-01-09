interface JobStatus<T = any> {
        id: string | undefined;
        data: T;
        status: string;
        timestamp: number;
        processedOn?: number;
        finishedOn?: number;
        attemptsMade: number;
        returnvalue: unknown;
        failedReason?: string;
}

export { JobStatus };
