import type { IncomingMessage } from 'node:http';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env.js';

// Inside a mounted router Express rewrites `req.url` ("/todos/1" becomes "/1"); `originalUrl` is intact.
const requestPath = (req: IncomingMessage): string | undefined =>
  'originalUrl' in req && typeof req.originalUrl === 'string' ? req.originalUrl : req.url;

export const logger = pino({
  level: env.LOG_LEVEL,
  // Human-readable one-line logs locally, structured JSON everywhere else.
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname,req,res,responseTime',
          },
        }
      : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${requestPath(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res, error) =>
    `${req.method} ${requestPath(req)} ${res.statusCode} ${error.message}`,
  // Keep request logs compact and never log headers: they contain the access token.
  serializers: {
    req: (req: { id: unknown; method: string; raw: IncomingMessage }) => ({
      id: req.id,
      method: req.method,
      url: requestPath(req.raw),
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
