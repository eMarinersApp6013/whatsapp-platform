// ── PostgreSQL connection pool ────────────────────────────────────────────────
'use strict'

const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST || '/var/run/postgresql',
  port:     parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'navystore_agent',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message)
})

module.exports = pool
