import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { 
  db, 
  isFeatureEnabled, 
  loadBankConfigs,
  getBankConfig
} from './config';
import { watcher } from './watcher';

const app = express();
const PORT = process.env.INGEST_API_PORT || 5106;

// Middleware
app.use(cors());
app.use(express.json());

// Feature flag middleware
const requireFeature = (req: Request, res: Response, next: NextFunction) => {
  if (!isFeatureEnabled()) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }
  next();
};

// Admin check middleware (simplified for demo)
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.headers['x-user-role'] || req.headers['x-role'];
  if (userRole !== 'admin' && userRole !== 'sp-ops') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply middleware to all /api/ingest routes
app.use('/api/ingest', requireFeature, requireAdmin);

// GET /api/ingest/configs - List bank configurations
app.get('/api/ingest/configs', async (req: Request, res: Response) => {
  try {
    const configs = await loadBankConfigs();
    
    // Redact sensitive information
    const sanitized = configs.map(config => ({
      bank: config.bank,
      timezone: config.timezone,
      cutoffs: config.cutoffs,
      grace_minutes: config.grace_minutes,
      completion_method: config.completion.method,
      validation: config.validation,
      active: config.active
    }));
    
    res.json(sanitized);
  } catch (error) {
    console.error('Error fetching configs:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

// GET /api/ingest/health - Connector health status
app.get('/api/ingest/health', async (req: Request, res: Response) => {
  try {
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
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching health:', error);
    res.status(500).json({ error: 'Failed to fetch health status' });
  }
});

// GET /api/ingest/files - List ingested files
app.get('/api/ingest/files', async (req: Request, res: Response) => {
  try {
    const { bank, date } = req.query;
    
    let query = `
      SELECT 
        id,
        bank,
        filename,
        business_date,
        size_bytes,
        status,
        fail_reason,
        seen_at,
        completed_at,
        downloaded_at,
        validated_at
      FROM ingested_files
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (bank) {
      params.push(bank);
      query += ` AND bank = $${params.length}`;
    }
    
    if (date) {
      params.push(date);
      query += ` AND business_date = $${params.length}`;
    }
    
    query += ' ORDER BY seen_at DESC LIMIT 100';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/ingest/expectations - Expected vs received files
app.get('/api/ingest/expectations', async (req: Request, res: Response) => {
  try {
    const { bank, date } = req.query;
    
    let query = `
      SELECT 
        bank,
        window_start,
        window_end,
        business_date,
        expected_name,
        expected_seq,
        required,
        received,
        received_at
      FROM file_expectations
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (bank) {
      params.push(bank);
      query += ` AND bank = $${params.length}`;
    }
    
    if (date) {
      params.push(date);
      query += ` AND business_date = $${params.length}`;
    }
    
    query += ' ORDER BY window_start DESC, expected_seq';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching expectations:', error);
    res.status(500).json({ error: 'Failed to fetch expectations' });
  }
});

// POST /api/ingest/reconcile - Recompute expectations
app.post('/api/ingest/reconcile', async (req: Request, res: Response) => {
  try {
    const { bank, date } = req.query;
    
    if (!bank || !date) {
      return res.status(400).json({ error: 'Bank and date required' });
    }
    
    // Recompute expectations for the specified bank and date
    const config = await getBankConfig(bank as string);
    if (!config) {
      return res.status(404).json({ error: 'Bank configuration not found' });
    }
    
    // Clear existing expectations
    await db.query(
      'DELETE FROM file_expectations WHERE bank = $1 AND business_date = $2',
      [bank, date]
    );
    
    // Regenerate expectations based on config
    // This would be more sophisticated in production
    const cutoffs = config.cutoffs;
    for (let i = 0; i < cutoffs.length; i++) {
      const seq = config.filename.seq_width > 0 ? i + 1 : null;
      const expectedName = generateExpectedFilename(config, date as string, seq);
      
      await db.query(`
        INSERT INTO file_expectations (
          bank, window_start, window_end, business_date,
          expected_name, expected_seq, required
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        bank,
        new Date(`${date}T${cutoffs[i]}:00`),
        new Date(`${date}T${cutoffs[i]}:00`),
        date,
        expectedName,
        seq,
        true
      ]);
    }
    
    res.json({ message: 'Expectations recomputed successfully' });
  } catch (error) {
    console.error('Error reconciling:', error);
    res.status(500).json({ error: 'Failed to reconcile' });
  }
});

// POST /api/ingest/pull-now - Trigger immediate poll
app.post('/api/ingest/pull-now', async (req: Request, res: Response) => {
  try {
    const { bank } = req.query;
    
    // In production, this would trigger an immediate poll for the specified bank
    // For now, we'll just return success
    res.json({ 
      message: `Poll triggered for ${bank || 'all banks'}`,
      note: 'This is a mock response - actual polling would happen in production'
    });
  } catch (error) {
    console.error('Error triggering poll:', error);
    res.status(500).json({ error: 'Failed to trigger poll' });
  }
});

// GET /api/ingest/alerts - Recent alerts
app.get('/api/ingest/alerts', async (req: Request, res: Response) => {
  try {
    const { bank, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        id,
        bank,
        alert_type,
        severity,
        message,
        details,
        created_at
      FROM ingest_alerts
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (bank) {
      params.push(bank);
      query += ` AND bank = $${params.length}`;
    }
    
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Helper function to generate expected filename
function generateExpectedFilename(config: any, date: string, seq: number | null): string {
  let filename = config.filename.pattern;
  
  // Replace date placeholders
  const dateObj = new Date(date);
  filename = filename.replace('%Y', dateObj.getFullYear().toString());
  filename = filename.replace('%m', (dateObj.getMonth() + 1).toString().padStart(2, '0'));
  filename = filename.replace('%d', dateObj.getDate().toString().padStart(2, '0'));
  
  // Replace sequence
  if (seq !== null && config.filename.seq_width > 0) {
    filename = filename.replace('%SEQ', seq.toString().padStart(config.filename.seq_width, '0'));
  }
  
  return filename;
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    service: 'ingest-api',
    feature_enabled: isFeatureEnabled()
  });
});

// Start server
async function startServer() {
  // Initialize database tables if needed
  const migrationPath = '/Users/shantanusingh/ops-dashboard/db/migrations/003_create_ingestion_tables.sql';
  
  try {
    // Check if tables exist
    const tableCheck = await db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'ingested_files'
    `);
    
    if (tableCheck.rows[0].count === '0') {
      console.log('Creating ingestion tables...');
      const fs = require('fs');
      const migration = fs.readFileSync(migrationPath, 'utf8');
      await db.query(migration);
      console.log('Ingestion tables created successfully');
    }
  } catch (error) {
    console.error('Error checking/creating tables:', error);
  }

  // Start the watcher if feature is enabled
  if (isFeatureEnabled()) {
    console.log('Starting SFTP watcher...');
    await watcher.start();
  }

  app.listen(PORT, () => {
    console.log(`Ingest API server running on port ${PORT}`);
    console.log(`Feature enabled: ${isFeatureEnabled()}`);
  });
}

// Handle shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await watcher.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await watcher.stop();
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;