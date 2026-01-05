export interface IEnvironment {
      APP: {
            NAME?: string;
            PORT: number;
            ENV?: string;
            CLIENT: string;
      };
      DB: {
            URL: string;
      };
      REDIS: {
            URL: string;
            PORT: number;
            PASSWORD: string;
      };
      CACHE_REDIS: {
            URL: string;
      };
      JWT: {
            ACCESS_KEY: string;
            REFRESH_KEY: string;
      };
      JWT_EXPIRES_IN: {
            REFRESH_SECONDS: number;
            REFRESH: string;
            ACCESS: string;
      };
      FRONTEND_URL: string;
      EMAIL: {
            API_KEY: string;
            FROM_EMAIL: string;
      };
}
