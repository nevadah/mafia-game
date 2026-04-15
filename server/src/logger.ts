import pino from 'pino';

/**
 * Shared Pino logger instance.
 *
 * Level precedence (highest wins):
 *   LOG_LEVEL env var  →  silent in test  →  'info' default
 *
 * In production, pipe server output through `pino-pretty` for human-readable
 * formatting during development:  node dist/index.js | pino-pretty
 */
const level =
  process.env.NODE_ENV === 'test'
    ? 'silent'
    : (process.env.LOG_LEVEL ?? 'info');

export const logger = pino({ level });
