import { z } from 'zod';

const passwordRegexMessage =
        'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const registerSchema = z
        .object({
                username: z
                        .string()
                        .min(3, 'Username must be at least 3 characters long')
                        .max(15, 'Username must be at most 15 characters long')
                        .regex(/^[a-zA-Z0-9_]+$/, {
                                message: 'Username must contain only letters, numbers and underscores'
                        }),
                email: z.string().email('Invalid email address'),
                password: z
                        .string()
                        .min(8, 'Password must be at least 8 characters long')
                        .regex(passwordRegex, { message: passwordRegexMessage }),
                confirmPassword: z.string().min(8, 'Confirm password must be at least 8 characters long'),
                isTermsAndConditionAccepted: z.boolean().refine(val => val === true, {
                        message: 'You must accept the terms and conditions'
                })
        })
        .refine(data => data.password === data.confirmPassword, {
                message: 'Passwords do not match',
                path: ['confirmPassword']
        });

export const loginSchema = z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(1, 'Password is required')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
