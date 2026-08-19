const { startDiscordBot } = require('./src/index.cjs');

const logger = {
  info(extra, message) { console.info(message, extra || {}); },
  warn(extra, message) { console.warn(message, extra || {}); },
  error(extra, message) { console.error(message, extra || {}); }
};

startDiscordBot(logger);
