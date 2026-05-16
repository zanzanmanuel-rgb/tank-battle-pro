const { createServer } = require('http');
const app = require('./app');
const { setupSocketIO } = require('./socket');
const { logger } = require('./lib/logger');

const port = Number(process.env.PORT) || 8080;
const httpServer = createServer(app);

setupSocketIO(httpServer);

httpServer.listen(port, (err) => {
  if (err) {
    logger.error({ err }, 'Error listening on port');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening');
});
