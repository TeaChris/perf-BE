import timeout from 'connect-timeout';

export const timeoutMiddleware = timeout('60000');
