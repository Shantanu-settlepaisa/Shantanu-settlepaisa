const { Pool } = require('pg');

// Database connection configuration
// In production, use environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'ops_user',
  password: process.env.DB_PASSWORD || 'ops_pass_2024',
  database: process.env.DB_NAME || 'ops_dashboard',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test connection
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error:', err);
});

// Helper function to run migrations
async function runMigration(sqlFile) {
  const client = await pool.connect();
  try {
    await client.query(sqlFile);
    console.log('[DB] Migration executed successfully');
  } catch (err) {
    console.error('[DB] Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Query helper with logging
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB Query]', { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('[DB Error]', err);
    throw err;
  }
}

module.exports = {
  pool,
  query,
  runMigration,
};