const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123'
});

// GET /bank-mappings - List all bank mappings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        config_name,
        bank_name,
        file_type,
        delimiter,
        v1_column_mappings,
        special_fields,
        is_active,
        source,
        created_at,
        updated_at
      FROM sp_v2_bank_column_mappings
      WHERE is_active = TRUE
      ORDER BY config_name
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      mappings: result.rows
    });
  } catch (error) {
    console.error('[Bank Mappings] Error fetching all mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bank mappings',
      message: error.message
    });
  }
});

// GET /bank-mappings/:name - Get specific bank mapping by config_name
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        config_name,
        bank_name,
        file_type,
        delimiter,
        v1_column_mappings,
        special_fields,
        date_format,
        amount_format,
        is_active,
        source
      FROM sp_v2_bank_column_mappings
      WHERE config_name = $1 AND is_active = TRUE
    `, [name.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank mapping not found',
        config_name: name
      });
    }
    
    res.json({
      success: true,
      mapping: result.rows[0]
    });
  } catch (error) {
    console.error('[Bank Mappings] Error fetching mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bank mapping',
      message: error.message
    });
  }
});

// POST /bank-mappings - Create new bank mapping
router.post('/', async (req, res) => {
  try {
    const {
      config_name,
      bank_name,
      file_type,
      delimiter,
      v1_column_mappings,
      special_fields,
      date_format = 'dd-MM-yyyy',
      amount_format = 'decimal',
      created_by = 'api'
    } = req.body;
    
    // Validation
    if (!config_name || !bank_name || !file_type || !v1_column_mappings) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['config_name', 'bank_name', 'file_type', 'v1_column_mappings']
      });
    }
    
    const result = await pool.query(`
      INSERT INTO sp_v2_bank_column_mappings 
      (config_name, bank_name, file_type, delimiter, v1_column_mappings, 
       special_fields, date_format, amount_format, source, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'API', $9)
      RETURNING *
    `, [
      config_name.toUpperCase(),
      bank_name,
      file_type,
      delimiter,
      JSON.stringify(v1_column_mappings),
      special_fields ? JSON.stringify(special_fields) : null,
      date_format,
      amount_format,
      created_by
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Bank mapping created successfully',
      mapping: result.rows[0]
    });
  } catch (error) {
    console.error('[Bank Mappings] Error creating mapping:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Bank mapping already exists',
        message: 'A mapping with this config_name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create bank mapping',
      message: error.message
    });
  }
});

// PUT /bank-mappings/:name - Update existing bank mapping
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const {
      bank_name,
      file_type,
      delimiter,
      v1_column_mappings,
      special_fields,
      date_format,
      amount_format,
      is_active,
      updated_by = 'api'
    } = req.body;
    
    // Build dynamic SET clause
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (bank_name !== undefined) {
      updates.push(`bank_name = $${paramCount++}`);
      values.push(bank_name);
    }
    if (file_type !== undefined) {
      updates.push(`file_type = $${paramCount++}`);
      values.push(file_type);
    }
    if (delimiter !== undefined) {
      updates.push(`delimiter = $${paramCount++}`);
      values.push(delimiter);
    }
    if (v1_column_mappings !== undefined) {
      updates.push(`v1_column_mappings = $${paramCount++}`);
      values.push(JSON.stringify(v1_column_mappings));
    }
    if (special_fields !== undefined) {
      updates.push(`special_fields = $${paramCount++}`);
      values.push(special_fields ? JSON.stringify(special_fields) : null);
    }
    if (date_format !== undefined) {
      updates.push(`date_format = $${paramCount++}`);
      values.push(date_format);
    }
    if (amount_format !== undefined) {
      updates.push(`amount_format = $${paramCount++}`);
      values.push(amount_format);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    
    updates.push(`updated_by = $${paramCount++}`);
    values.push(updated_by);
    
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(name.toUpperCase());
    
    const result = await pool.query(`
      UPDATE sp_v2_bank_column_mappings
      SET ${updates.join(', ')}
      WHERE config_name = $${paramCount}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank mapping not found',
        config_name: name
      });
    }
    
    res.json({
      success: true,
      message: 'Bank mapping updated successfully',
      mapping: result.rows[0]
    });
  } catch (error) {
    console.error('[Bank Mappings] Error updating mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bank mapping',
      message: error.message
    });
  }
});

// DELETE /bank-mappings/:name - Soft delete (set is_active = false)
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const result = await pool.query(`
      UPDATE sp_v2_bank_column_mappings
      SET is_active = FALSE, updated_at = NOW()
      WHERE config_name = $1
      RETURNING id, config_name
    `, [name.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank mapping not found',
        config_name: name
      });
    }
    
    res.json({
      success: true,
      message: 'Bank mapping deactivated successfully',
      config_name: result.rows[0].config_name
    });
  } catch (error) {
    console.error('[Bank Mappings] Error deleting mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bank mapping',
      message: error.message
    });
  }
});

module.exports = router;
