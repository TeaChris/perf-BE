import { ENVIRONMENT } from './environment';

/**
 * Allowed origins for CORS and CSRF protection
 * Centralized to avoid duplication across middleware
 */
export const ALLOWED_ORIGINS = [
      ENVIRONMENT.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
].filter(Boolean);
