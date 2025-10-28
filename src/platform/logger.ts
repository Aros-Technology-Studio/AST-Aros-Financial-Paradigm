const level = process.env.LOG_LEVEL || 'info';

function bind(method: 'log' | 'debug' | 'info' | 'warn' | 'error') {
  return (...args: unknown[]) => (console as any)[method](...args);
}

export const logger = {
  level,
  debug: bind('debug'),
  info: bind('info'),
  warn: bind('warn'),
  error: bind('error')
};
