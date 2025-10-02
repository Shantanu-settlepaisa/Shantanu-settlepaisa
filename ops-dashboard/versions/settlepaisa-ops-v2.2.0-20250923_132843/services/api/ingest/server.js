const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.INGEST_API_PORT || 5106;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'settlepaisa_ops',
});

// Feature flag check
const isFeatureEnabled = () => {
  return process.env.FEATURE_BANK_SFTP_INGESTION === 'true';
};

// Feature flag middleware
const requireFeature = (req, res, next) => {
  if (!isFeatureEnabled()) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }
  next();
};

// Admin check middleware
const requireAdmin = (req, res, next) => {
  const userRole = req.headers['x-user-role'] || req.headers['x-role'];
  if (userRole !== 'admin' && userRole !== 'sp-ops') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply middleware to all /api/ingest routes
app.use('/api/ingest', requireFeature, requireAdmin);

// Import mock data
const { mockHealthData, mockFiles, mockExpectations } = require('./mock-data');

// GET /api/ingest/health - Connector health status
app.get('/api/ingest/health', async (req, res) => {
  try {
    // Try database first, fall back to mock data
    const result = await db.query(`
      SELECT 
        bank,
        last_file_at,
        expected_count,
        received_count,
        lag_minutes,
        window_status,
        message,
        updated_at
      FROM connector_health
      ORDER BY bank
    `).catch(() => ({ rows: mockHealthData }));
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching health, using mock data:', error);
    res.json(mockHealthData);
  }
});

// GET /api/ingest/files - List ingested files
app.get('/api/ingest/files', async (req, res) => {
  try {
    const { bank } = req.query;
    
    // Use mock data for now
    const filtered = bank ? mockFiles.filter(f => f.bank === bank) : mockFiles;
    res.json(filtered);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.json(mockFiles);
  }
});

// GET /api/ingest/expectations - Expected vs received files
app.get('/api/ingest/expectations', async (req, res) => {
  try {
    const { bank } = req.query;
    
    // Use mock data for now
    const filtered = bank ? mockExpectations.filter(e => e.bank === bank) : mockExpectations;
    res.json(filtered);
  } catch (error) {
    console.error('Error fetching expectations:', error);
    res.json(mockExpectations);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'ingest-api',
    feature_enabled: isFeatureEnabled()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Ingest API server running on port ${PORT}`);
  console.log(`Feature enabled: ${isFeatureEnabled()}`);
});