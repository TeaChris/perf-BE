import { Response } from 'express';

export const AppResponse = (
        res: Response,
        status: number,
        message: string,
        data: Record<string, string[]> | unknown | string | null
) => {
        return res.status(status).json({
                status: 'success',
                data: data ?? null,
                message: message ?? null
        });
};
