import { ENVIRONMENT } from '@/config';
import { IUser } from '../interface';
import { Response, CookieOptions } from 'express';

const dateFromString = async (value: string) => {
        const date = new Date(value);

        if (isNaN(date?.getTime())) {
                throw new Error('Invalid date');
        }

        return date;
};

const sanitizeRequestBody = (data: Record<string, unknown>) => {
        const sanitize: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(data)) {
                if (value === null || value === undefined) {
                        sanitize[key] = value;
                        continue;
                }

                if (typeof value === 'string') {
                        sanitize[key] = value.trim() === '' ? null : value.trim();
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                        sanitize[key] = sanitizeRequestBody(value as Record<string, unknown>);
                } else if (Array.isArray(value)) {
                        sanitize[key] = value.map(item =>
                                typeof item === 'object' && item !== null
                                        ? sanitizeRequestBody(item as Record<string, unknown>)
                                        : item
                        );
                } else {
                        sanitize[key] = value;
                }
        }

        return sanitize;
};

const toJSON = (obj: IUser, fields?: string[]): Partial<IUser> => {
        const user = JSON.parse(JSON.stringify(obj));

        if (fields && fields.length === 0) {
                return user;
        }

        const results = { ...user };

        if (fields && fields.length > 0) {
                for (const field of fields) {
                        if (field in results) {
                                delete results[field as keyof IUser];
                        }
                }
                return results;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { refreshToken, loginRetries, lastLogin, password, updatedAt, ...rest } = user;

        return rest;
};

const setCookie = (res: Response, name: string, value: string, options: CookieOptions = {}) => {
        res.cookie(name, value, {
                httpOnly: true,
                secure: ENVIRONMENT.APP.ENV === 'production',
                path: '/',
                sameSite: ENVIRONMENT.APP.ENV === 'production' ? 'none' : 'lax',
                partitioned: ENVIRONMENT.APP.ENV === 'production',
                domain: ENVIRONMENT.COOKIE.DOMAIN,
                ...options
        });
};

const oneHour = 60 * 60 * 1000;
const fiveMinutes = 5 * 60 * 1000;
const fifteenMinutes = 15 * 60 * 1000;
const twentyFourHours = 24 * 60 * 60 * 1000;

export {
        toJSON,
        oneHour,
        setCookie,
        fiveMinutes,
        fifteenMinutes,
        dateFromString,
        twentyFourHours,
        sanitizeRequestBody
};
