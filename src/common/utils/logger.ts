import path from 'path';
import { getCorrelationId } from './context';
import { createLogger, transports, format, Logger } from 'winston';

const { combine, timestamp, json, splat, errors, colorize, printf, label } = format;

const consoleFormat = combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        splat(),
        errors({ stack: true }),
        printf(info => {
                const correlationId = getCorrelationId();
                const correlationStr = correlationId ? ` [${correlationId}]` : '';
                const moduleStr = info.label ? ` (${info.label})` : '';
                return `${info.timestamp} ${info.level}${moduleStr}${correlationStr}: ${info.message}`;
        })
);

const fileFormat = combine(
        timestamp(),
        splat(),
        errors({ stack: true }),
        json(),
        format(info => {
                const correlationId = getCorrelationId();
                if (correlationId) {
                        info.correlationId = correlationId;
                }
                return info;
        })()
);

const createBaseLogger = (moduleLabel?: string): Logger => {
        const logger = createLogger({
                level: process.env.LOG_LEVEL || 'info',
                format: fileFormat,
                defaultMeta: { service: 'performance-be' },
                transports: [
                        new transports.File({
                                filename: path.join(process.cwd(), 'logs', 'error.log'),
                                level: 'error'
                        }),
                        new transports.File({
                                filename: path.join(process.cwd(), 'logs', 'combined.log')
                        })
                ]
        });

        if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true') {
                logger.add(
                        new transports.Console({
                                format: consoleFormat
                        })
                );
        }

        if (moduleLabel) {
                return logger.child({ label: moduleLabel });
        }

        return logger;
};

// Default logger
const logger = createBaseLogger();

/**
 * Factory to create child loggers for specific modules
 */
export const getModuleLogger = (moduleName: string): Logger => {
        // We can potentially look up dynamic log levels here if needed
        return logger.child({ label: moduleName });
};

export const stream = {
        write: (message: string) => logger.info(message.trim())
};

export { logger };
