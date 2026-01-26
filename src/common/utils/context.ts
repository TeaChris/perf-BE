import { AsyncLocalStorage } from 'async_hooks';

export const context = new AsyncLocalStorage<Map<string, any>>();

export const getCorrelationId = (): string | undefined => {
        const store = context.getStore();
        return store?.get('correlationId');
};

export const setCorrelationId = (id: string) => {
        const store = context.getStore();
        store?.set('correlationId', id);
};
