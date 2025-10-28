import { createServer } from './platform/server.js';
import { logger } from './platform/logger.js';

const port = Number(process.env.PORT || 8080);
createServer().listen(port, () => {
  logger.info({ port }, 'AST bootstrap server started');
});
