const Queue = require('bull');

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  db: 1,
};

function createQueue(name) {
  return new Queue(name, { redis: redisConfig });
}

module.exports = { redisConfig, createQueue };
