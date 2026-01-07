import { IEnvironment } from '@/common';

// validation
const validateEnvironment = () => {
      const requiredVars = [
            'DATABASE_URL',
            'CACHE_REDIS_URL',
            'QUEUE_REDIS_URL',
            'REFRESH_JWT_KEY',
            'ACCESS_JWT_KEY',
            'REFRESH_JWT_EXPIRES_IN_SECONDS',
            'REFRESH_JWT_EXPIRES_IN',
            'ACCESS_JWT_EXPIRES_IN',
            'FRONTEND_URL',
            'API_KEY',
            'FROM_EMAIL'
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);

      if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      //   validate JWT keys length
      if (process.env.REFRESH_JWT_KEY!.length < 32) {
            throw new Error('REFRESH_JWT_KEY must be at least 32 characters long!');
      }

      if (process.env.ACCESS_JWT_KEY!.length < 32) {
            throw new Error('ACCESS_JWT_KEY must be at least 32 characters long!');
      }

      //   validate URLs
      try {
            new URL(process.env.DATABASE_URL!);
            new URL(process.env.FRONTEND_URL!);
            new URL(process.env.CACHE_REDIS_URL!);
            new URL(process.env.QUEUE_REDIS_URL!);
      } catch (error) {
            throw new Error('Invalid URL format in environment variable!');
      }
};

// validate environment on import
validateEnvironment();

export const ENVIRONMENT: IEnvironment = {
      APP: {
            ENV: process.env.NODE_ENV,
            NAME: process.env.APP_NAME,
            CLIENT: process.env.CLIENT as string,
            PORT: parseInt(process.env.PORT || process.env.APP_PORT || '3000')
      },
      DB: {
            URL: process.env.DATABASE_URL as string
      },
      CACHE_REDIS: {
            URL: process.env.CACHE_REDIS_URL as string
      },
      REDIS: {
            URL: process.env.QUEUE_REDIS_URL as string,
            PORT: parseInt(process.env.QUEUE_REDIS_PORT || '6379'),
            PASSWORD: process.env.QUEUE_REDIS_PASSWORD as string
      },
      JWT: {
            REFRESH_KEY: process.env.REFRESH_JWT_KEY!,
            ACCESS_KEY: process.env.ACCESS_JWT_KEY!
      },
      JWT_EXPIRES_IN: {
            REFRESH_SECONDS: parseInt(process.env.REFRESH_JWT_EXPIRES_IN_SECONDS!, 10),
            REFRESH: process.env.REFRESH_JWT_EXPIRES_IN!,
            ACCESS: process.env.ACCESS_JWT_EXPIRES_IN!
      },
      FRONTEND_URL: process.env.FRONTEND_URL!,
      EMAIL: {
            API_KEY: process.env.API_KEY!,
            FROM_EMAIL: process.env.FROM_EMAIL!
      }
};
