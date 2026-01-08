interface JobStatus {
        id: string | undefined;
        data: any;
        status: string;
        timestamp: number;
        processedOn?: number;
        finishedOn?: number;
        attemptsMade: number;
        returnvalue: any;
        failedReason?: string;
}

export { JobStatus };
