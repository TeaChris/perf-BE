import mongoose, { HydratedDocument, Model } from 'mongoose';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import { ENVIRONMENT } from '../config';
import { Role, IUser, UserMethods } from '../common';

type UserModel = Model<IUser, unknown, UserMethods>;

const userSchema = new mongoose.Schema<IUser, UserModel, UserMethods>(
        {
                username: {
                        type: String,
                        unique: true,
                        required: [true, 'Username is required'],
                        min: [3, 'Username must be at least 3 characters long'],
                        max: [20, 'Username must be at most 20 characters long']
                },
                email: {
                        trim: true,
                        type: String,
                        required: true,
                        unique: true,
                        lowercase: true,
                        validate: {
                                validator: function (v: string) {
                                        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
                                },
                                message: 'Please enter a valid email address'
                        }
                },
                password: {
                        type: String,
                        select: false,
                        required: true,
                        min: [6, 'Password must be at least 6 characters long']
                },
                lastLogin: {
                        type: Date,
                        default: Date.now
                },
                role: {
                        type: String,
                        default: Role.USER,
                        enum: Object.values(Role)
                },
                createdAt: {
                        type: Date,
                        default: Date.now
                },
                updatedAt: {
                        type: Date,
                        default: Date.now
                },
                ipAddress: {
                        type: String,
                        select: false
                },
                isDeleted: {
                        type: Boolean,
                        default: false,
                        select: false
                },
                isVerified: {
                        type: Boolean,
                        default: false,
                        select: false
                },
                isSuspended: {
                        type: Boolean,
                        default: false
                },
                loginAttempts: {
                        type: Number,
                        select: false,
                        default: 0
                },
                verificationToken: {
                        type: String,
                        select: false
                },
                isTermsAndConditionAccepted: {
                        type: Boolean,
                        default: false,
                        required: [true, 'Terms and condition is required']
                },
                tokenVersion: {
                        type: Number,
                        default: 0
                }
        },
        {
                timestamps: true,
                versionKey: false
        }
);

// pick users who are not deleted/suspended
userSchema.pre(/^find/, function (this: mongoose.Query<any, IUser>) {
        const query = this.getQuery();
        if (Object.keys(query).includes('isDeleted')) {
                this.where({ isSuspended: { $ne: true } });
                return;
        }

        this.where({ isDeleted: { $ne: true }, isSuspended: { $ne: true } });
});

// verify user password
userSchema.method('verifyPassword', async function (this: HydratedDocument<IUser>, password: string) {
        if (!this.password) return false;

        const isValid = await argon2.verify(this.password, password);
        return isValid;
});

// hash password before saving to DB
userSchema.pre('save', async function (this: HydratedDocument<IUser>) {
        if (!this.isModified('password')) return;
        this.password = await argon2.hash(this.password);
});

// generate access token
userSchema.method(
        'generateAccessToken',
        function (this: HydratedDocument<IUser>, options?: jwt.SignOptions, jti?: string) {
                const signOptions: jwt.SignOptions = {
                        expiresIn: ENVIRONMENT.JWT_EXPIRES_IN.ACCESS as any,
                        issuer: ENVIRONMENT.APP.NAME,
                        audience: ENVIRONMENT.APP.CLIENT,
                        ...options,
                        jwtid: jti
                };
                return jwt.sign({ id: this._id, version: this.tokenVersion }, ENVIRONMENT.JWT.ACCESS_KEY, signOptions);
        }
);

// generate refresh token
userSchema.method(
        'generateRefreshToken',
        function (this: HydratedDocument<IUser>, options?: jwt.SignOptions, jti?: string) {
                const signOptions: jwt.SignOptions = {
                        expiresIn: ENVIRONMENT.JWT_EXPIRES_IN.REFRESH as any,
                        issuer: ENVIRONMENT.APP.NAME,
                        audience: ENVIRONMENT.APP.CLIENT,
                        ...options,
                        jwtid: jti
                };
                return jwt.sign({ id: this._id, version: this.tokenVersion }, ENVIRONMENT.JWT.REFRESH_KEY, signOptions);
        }
);

export const User = (mongoose.models.User as UserModel) || mongoose.model<IUser, UserModel>('User', userSchema);
