const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[Disputes API] Database connection failed:', err.message);
  } else {
    console.log('[Disputes API] Database connected:', res.rows[0].now);
  }
});

// Mount routes
const chargebacksRouter = require('./routes/chargebacks');
const ingestionRouter = require('./routes/ingestion');
const kpisRouter = require('./routes/kpis');

// Mount KPIs first (more specific routes)
app.use('/v1/chargebacks', kpisRouter(pool));
app.use('/api/chargebacks/ingest', ingestionRouter(pool));
// Mount general chargebacks last (catch-all routes)
app.use('/v1/chargebacks', chargebacksRouter(pool));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'disputes-api',
    timestamp: new Date().toISOString() 
  });
});

const PORT = 5104;
app.listen(PORT, () => {
  console.log(`[Disputes API] Running on port ${PORT}`);
  console.log(`[Disputes API] Health check: http://localhost:${PORT}/health`);
  console.log(`[Disputes API] Chargebacks: http://localhost:${PORT}/v1/chargebacks`);
  console.log(`[Disputes API] Ingestion: http://localhost:${PORT}/api/chargebacks/ingest`);
});

module.exports = app;
