'use strict'
const { createClient } = require('redis')

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380'),
  },
  database: parseInt(process.env.REDIS_DB || '1'),
})

client.on('error', (err) => console.error('[Redis] Error:', err.message))
client.on('connect', () => console.log('[Redis] Connected'))

// Connect lazily — don't crash app if Redis is down
client.connect().catch((err) => console.warn('[Redis] Could not connect:', err.message))

module.exports = client
