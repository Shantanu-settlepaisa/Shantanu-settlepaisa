const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;
    
    let query = `
      SELECT 
        id,
        name,
        connector_type,
        source_entity,
        status,
        connection_config,
        schedule_enabled,
        schedule_cron,
        last_run_at,
        last_run_status,
        last_run_details,
        success_count,
        failure_count,
        total_runs,
        created_at
      FROM sp_v2_connectors
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    if (type) {
      params.push(type);
      query += ` AND connector_type = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    const connectors = result.rows.map(row => ({
      ...row,
      success_rate: row.total_runs > 0 
        ? Math.round((row.success_count / row.total_runs) * 100) 
        : 0
    }));
    
    const summary = {
      total: connectors.length,
      active: connectors.filter(c => c.status === 'ACTIVE').length,
      paused: connectors.filter(c => c.status === 'PAUSED').length,
      failed: connectors.filter(c => c.status === 'FAILED').length
    };
    
    res.json({
      success: true,
      connectors,
      summary
    });
    
  } catch (error) {
    console.error('[Connectors API] Error fetching connectors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM sp_v2_connectors WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    res.json({
      success: true,
      connector: result.rows[0]
    });
    
  } catch (error) {
    console.error('[Connectors API] Error fetching connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      name,
      connector_type,
      source_entity,
      connection_config,
      schedule_enabled,
      schedule_cron,
      created_by
    } = req.body;
    
    if (!name || !connector_type || !source_entity || !connection_config) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, connector_type, source_entity, connection_config'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO sp_v2_connectors (
        name,
        connector_type,
        source_entity,
        status,
        connection_config,
        schedule_enabled,
        schedule_cron,
        created_by
      ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7)
      RETURNING *
    `, [
      name,
      connector_type,
      source_entity,
      JSON.stringify(connection_config),
      schedule_enabled || true,
      schedule_cron || '0 2 * * *',
      created_by || 'USER'
    ]);
    
    res.status(201).json({
      success: true,
      connector: result.rows[0],
      message: 'Connector created successfully'
    });
    
  } catch (error) {
    console.error('[Connectors API] Error creating connector:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Connector with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      connection_config,
      schedule_enabled,
      schedule_cron
    } = req.body;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (name) {
      params.push(name);
      updates.push(`name = $${paramIndex++}`);
    }
    
    if (connection_config) {
      params.push(JSON.stringify(connection_config));
      updates.push(`connection_config = $${paramIndex++}`);
    }
    
    if (schedule_enabled !== undefined) {
      params.push(schedule_enabled);
      updates.push(`schedule_enabled = $${paramIndex++}`);
    }
    
    if (schedule_cron) {
      params.push(schedule_cron);
      updates.push(`schedule_cron = $${paramIndex++}`);
    }
    
    updates.push(`updated_at = NOW()`);
    
    params.push(id);
    
    const result = await pool.query(`
      UPDATE sp_v2_connectors 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    res.json({
      success: true,
      connector: result.rows[0],
      message: 'Connector updated successfully'
    });
    
  } catch (error) {
    console.error('[Connectors API] Error updating connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM sp_v2_connectors WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Connector deleted successfully'
    });
    
  } catch (error) {
    console.error('[Connectors API] Error deleting connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    
    const connectorResult = await pool.query(`
      SELECT * FROM sp_v2_connectors WHERE id = $1
    `, [id]);
    
    if (connectorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    const connector = connectorResult.rows[0];
    
    const runId = await pool.query(`
      INSERT INTO sp_v2_connector_runs (
        connector_id,
        run_type,
        status,
        triggered_by
      ) VALUES ($1, 'TEST', 'RUNNING', $2)
      RETURNING id
    `, [id, req.body.triggered_by || 'USER']);
    
    const startTime = Date.now();
    let testResult;
    
    try {
      if (connector.connector_type === 'PG_API') {
        const { syncPgTransactions } = require('../services/pg-sync-service');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const cycleDate = yesterday.toISOString().split('T')[0];
        
        testResult = await syncPgTransactions(cycleDate, 'ALL');
      } else if (connector.connector_type === 'BANK_SFTP') {
        const { testSftpConnection } = require('../services/sftp-connector-service');
        testResult = await testSftpConnection(connector.connection_config);
        testResult.records_processed = testResult.filesFound || 0;
      } else if (connector.connector_type === 'BANK_API') {
        const { testApiConnection } = require('../services/api-connector-service');
        testResult = await testApiConnection(connector.connection_config);
        testResult.records_processed = 0;
      } else {
        testResult = {
          success: false,
          message: 'Unknown connector type',
          records_processed: 0
        };
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      await pool.query(`
        UPDATE sp_v2_connector_runs
        SET 
          status = $1,
          records_processed = $2,
          duration_seconds = $3,
          completed_at = NOW(),
          details = $4
        WHERE id = $5
      `, [
        testResult.success ? 'SUCCESS' : 'FAILED',
        testResult.count || 0,
        duration,
        JSON.stringify(testResult),
        runId.rows[0].id
      ]);
      
      await pool.query(`
        UPDATE sp_v2_connectors
        SET 
          last_run_at = NOW(),
          last_run_status = $1,
          last_run_details = $2,
          total_runs = total_runs + 1,
          success_count = success_count + $3
        WHERE id = $4
      `, [
        testResult.success ? 'SUCCESS' : 'FAILED',
        JSON.stringify(testResult),
        testResult.success ? 1 : 0,
        id
      ]);
      
      res.json({
        success: true,
        test_result: testResult,
        run_id: runId.rows[0].id,
        message: 'Test completed successfully'
      });
      
    } catch (testError) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      await pool.query(`
        UPDATE sp_v2_connector_runs
        SET 
          status = 'FAILED',
          error_message = $1,
          duration_seconds = $2,
          completed_at = NOW()
        WHERE id = $3
      `, [testError.message, duration, runId.rows[0].id]);
      
      await pool.query(`
        UPDATE sp_v2_connectors
        SET 
          last_run_at = NOW(),
          last_run_status = 'FAILED',
          last_run_details = $1,
          total_runs = total_runs + 1,
          failure_count = failure_count + 1,
          status = 'FAILED'
        WHERE id = $2
      `, [JSON.stringify({ error: testError.message }), id]);
      
      throw testError;
    }
    
  } catch (error) {
    console.error('[Connectors API] Error testing connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const { run_date, triggered_by } = req.body;
    
    const connectorResult = await pool.query(`
      SELECT * FROM sp_v2_connectors WHERE id = $1
    `, [id]);
    
    if (connectorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    const connector = connectorResult.rows[0];
    
    if (connector.status === 'PAUSED') {
      return res.status(400).json({
        success: false,
        error: 'Cannot run paused connector. Resume it first.'
      });
    }
    
    const runResult = await pool.query(`
      INSERT INTO sp_v2_connector_runs (
        connector_id,
        run_type,
        run_date,
        status,
        triggered_by
      ) VALUES ($1, 'MANUAL', $2, 'RUNNING', $3)
      RETURNING id
    `, [id, run_date || new Date().toISOString().split('T')[0], triggered_by || 'USER']);
    
    res.json({
      success: true,
      run_id: runResult.rows[0].id,
      message: 'Connector run started',
      status: 'RUNNING'
    });
    
    (async () => {
      const startTime = Date.now();
      
      try {
        let runResult;
        const cycleDate = run_date || new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        if (connector.connector_type === 'PG_API') {
          const { syncPgTransactions } = require('../services/pg-sync-service');
          runResult = await syncPgTransactions(cycleDate, 'ALL');
        } else if (connector.connector_type === 'BANK_SFTP') {
          const { downloadSftpFiles } = require('../services/sftp-connector-service');
          runResult = await downloadSftpFiles(connector.connection_config, cycleDate, connector.source_entity);
          runResult.count = runResult.recordsProcessed || 0;
        } else if (connector.connector_type === 'BANK_API') {
          const { fetchFromBankApi } = require('../services/api-connector-service');
          runResult = await fetchFromBankApi(connector.connection_config, cycleDate, connector.source_entity);
          runResult.count = runResult.recordsProcessed || 0;
        } else {
          runResult = {
            success: false,
            message: 'Unknown connector type',
            count: 0
          };
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        await pool.query(`
          UPDATE sp_v2_connector_runs
          SET 
            status = $1,
            records_processed = $2,
            records_success = $3,
            duration_seconds = $4,
            completed_at = NOW(),
            details = $5
          WHERE id = $6
        `, [
          runResult.success ? 'SUCCESS' : 'FAILED',
          runResult.count || 0,
          runResult.count || 0,
          duration,
          JSON.stringify(runResult),
          runResult.rows[0].id
        ]);
        
        await pool.query(`
          UPDATE sp_v2_connectors
          SET 
            last_run_at = NOW(),
            last_run_status = $1,
            last_run_details = $2,
            total_runs = total_runs + 1,
            success_count = success_count + $3
          WHERE id = $4
        `, [
          runResult.success ? 'SUCCESS' : 'FAILED',
          JSON.stringify(runResult),
          runResult.success ? 1 : 0,
          id
        ]);
        
      } catch (error) {
        console.error('[Connectors API] Run failed:', error);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        await pool.query(`
          UPDATE sp_v2_connector_runs
          SET 
            status = 'FAILED',
            error_message = $1,
            duration_seconds = $2,
            completed_at = NOW()
          WHERE id = $3
        `, [error.message, duration, runResult.rows[0].id]);
        
        await pool.query(`
          UPDATE sp_v2_connectors
          SET 
            last_run_at = NOW(),
            last_run_status = 'FAILED',
            total_runs = total_runs + 1,
            failure_count = failure_count + 1
          WHERE id = $2
        `, [id]);
      }
    })();
    
  } catch (error) {
    console.error('[Connectors API] Error running connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE sp_v2_connectors 
      SET status = 'PAUSED', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    res.json({
      success: true,
      connector: result.rows[0],
      message: 'Connector paused successfully'
    });
    
  } catch (error) {
    console.error('[Connectors API] Error pausing connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE sp_v2_connectors 
      SET status = 'ACTIVE', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Connector not found'
      });
    }
    
    res.json({
      success: true,
      connector: result.rows[0],
      message: 'Connector resumed successfully'
    });
    
  } catch (error) {
    console.error('[Connectors API] Error resuming connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 30, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        id,
        run_type,
        run_date,
        status,
        records_processed,
        records_success,
        records_failed,
        duration_seconds,
        error_message,
        details,
        started_at,
        completed_at,
        triggered_by
      FROM sp_v2_connector_runs
      WHERE connector_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM sp_v2_connector_runs WHERE connector_id = $1
    `, [id]);
    
    res.json({
      success: true,
      runs: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('[Connectors API] Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
