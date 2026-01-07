import { createLogger, transports, format } from 'winston';
import path from 'path';

const logFormat = format.combine(
      format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.label({
            label: 'right meow!'
      }),
      format.json(),
      format.splat(),
      format.errors({
            stack: true
      }),
      format.colorize(),
      format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const logger = createLogger({
      level: 'info',
      format: logFormat,
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

if (process.env.NODE_ENV === 'development') {
      logger.add(
            new transports.Console({
                  format: format.combine(
                        format.colorize(),
                        format.simple(),
                        format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
                  )
            })
      );
}

export const stream = {
      write: (message: string) => logger.info(message.trim())
};

export { logger };
