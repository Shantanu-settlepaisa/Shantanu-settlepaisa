const express = require('express');
const cors = require('cors');
const { SabPaisaConnector } = require('./sabpaisa-connector.cjs');

const app = express();
const PORT = process.env.SABPAISA_CONNECTOR_PORT || 5114;

app.use(cors());
app.use(express.json());

const connector = new SabPaisaConnector();

app.get('/health', async (req, res) => {
  const health = await connector.healthCheck();
  res.json(health);
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { date, clientCode, status, limit } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
    }
    
    const transactions = await connector.fetchPGTransactions(date, {
      clientCode,
      status,
      limit: limit ? parseInt(limit) : null
    });
    
    res.json({
      success: true,
      count: transactions.length,
      date,
      transactions
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/bank-statements', async (req, res) => {
  try {
    const { date, bankName, limit } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
    }
    
    const statements = await connector.fetchBankStatements(date, {
      bankName,
      limit: limit ? parseInt(limit) : null
    });
    
    res.json({
      success: true,
      count: statements.length,
      date,
      statements
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/merchants', async (req, res) => {
  try {
    const { status, search, limit } = req.query;
    
    const merchants = await connector.fetchMerchants({
      status,
      search,
      limit: limit ? parseInt(limit) : 100
    });
    
    res.json({
      success: true,
      count: merchants.length,
      merchants
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/fee-bearer/:clientCode', async (req, res) => {
  try {
    const { clientCode } = req.params;
    
    const feeBearerConfig = await connector.fetchFeeBearerConfig(clientCode);
    
    res.json({
      success: true,
      clientCode,
      config: feeBearerConfig
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const health = await connector.healthCheck();
    
    res.json({
      service: 'SabPaisa Connector',
      status: health.status,
      database: {
        host: health.host,
        database: health.database,
        port: health.port
      },
      statistics: health.statistics,
      uptime: process.uptime()
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

process.on('SIGTERM', async () => {
  console.log('[SabPaisa Connector] SIGTERM received, closing connections...');
  await connector.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[SabPaisa Connector] Service running on port ${PORT}`);
  console.log(`[SabPaisa Connector] Endpoints:`);
  console.log(`  - GET  /health                          - Health check`);
  console.log(`  - GET  /api/transactions?date=YYYY-MM-DD - Fetch PG transactions`);
  console.log(`  - GET  /api/bank-statements?date=YYYY-MM-DD - Fetch bank statements`);
  console.log(`  - GET  /api/merchants                   - List merchants`);
  console.log(`  - GET  /api/fee-bearer/:clientCode      - Get fee bearer config`);
  console.log(`  - GET  /api/stats                       - Service statistics`);
});
