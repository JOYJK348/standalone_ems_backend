/**
 * Logging Utility
 * 
 * Centralized logging system with different log levels and structured output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
    [key: string]: any;
}

class Logger {
    private level: LogLevel;

    constructor() {
        this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    private formatMessage(level: LogLevel, message: string, metadata?: LogMetadata): string {
        const timestamp = new Date().toISOString();
        let meta = '';
        if (metadata) {
            try {
                meta = ` ${JSON.stringify(metadata, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                )}`;
            } catch (e) {
                meta = ` [Error stringifying metadata]`;
            }
        }
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${meta}`;
    }

    debug(message: string, metadata?: LogMetadata): void {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message, metadata));
        }
    }

    info(message: string, metadata?: LogMetadata): void {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message, metadata));
        }
    }

    warn(message: string, metadata?: LogMetadata): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, metadata));
        }
    }

    error(message: string, error?: Error | any, metadata?: LogMetadata): void {
        if (this.shouldLog('error')) {
            const errorMeta = error instanceof Error
                ? { error: error.message, stack: error.stack, ...metadata }
                : { error, ...metadata };
            console.error(this.formatMessage('error', message, errorMeta));
        }
    }
}

export const logger = new Logger();
