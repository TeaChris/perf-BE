import * as z from 'zod';

const passwordRegexMessage =
        'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Base schema without refinements (allows .partial() to work)
const baseMainSchema = z.object({
        username: z
                .string()
                .min(3, 'username must be at least 3 characters long')
                .max(15, 'username must be at most 15 characters long')
                .regex(/^[a-zA-Z0-9_]+$/, { message: 'username must contain only letters, numbers and underscores' }),
        email: z.string().email('Invalid email address'),
        password: z
                .string()
                .min(8, 'password must be at least 8 characters long')
                .regex(passwordRegex, { message: passwordRegexMessage }),
        confirmPassword: z
                .string()
                .min(8, 'confirm password must be at least 8 characters long')
                .regex(passwordRegex, { message: passwordRegexMessage }),
        code: z
                .string()
                .min(6, 'code must be at least 6 characters long')
                .max(6, 'code must be at most 6 characters long'),
        token: z.string(),
        userId: z.string().regex(/^[0-9a-fA-F]{24}$/, { message: 'Invalid user ID' }),
        isTermsAndConditionAcepted: z.boolean(),
        redirectUrl: z.string().url()
});

// Full schema with password matching refinement
export const mainSchema = baseMainSchema.refine(data => data.password === data.confirmPassword, {
        message: 'passwords do not match',
        path: ['confirmPassword']
});

// Partial schema for optional fields (no refinement needed since fields are optional)
export const partialMainSchema = baseMainSchema.partial();
