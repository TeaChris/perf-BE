import { Model } from 'mongoose';
import type { SignOptions } from 'jsonwebtoken';

import { Role } from '../constant';
export { Role };

export interface IUser {
        role: Role;
        email: string;
        lastLogin: Date;
        createdAt: Date;
        updatedAt: Date;
        password: string;
        username: string;
        ipAddress: string;
        isDeleted: boolean;
        isVerified: boolean;
        tokenVersion: number;
        isSuspended: boolean;
        loginAttempts: number;
        lockoutUntil: Date | null;
        verificationToken: string | null;
        isTermsAndConditionAccepted: boolean;
}

export interface UserMethods extends Omit<IUser, 'toJSON'> {
        generateAccessToken(options?: SignOptions, jti?: string): string;
        generateRefreshToken(options?: SignOptions, jti?: string): string;
        verifyPassword(enterPassword: string): Promise<boolean>;
        toJSON(excludedFields?: Array<keyof IUser>): object;
}

export type UserModel = Model<IUser, {}, UserMethods>;
