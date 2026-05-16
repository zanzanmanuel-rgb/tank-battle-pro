const { createServer } = require('http');
const app = require('./app.js');
const { setupSocketIO } = require('./socket.js');
const { logger } = require('./logger.js'); // ← Corregido: le quitamos el ./lib/


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
