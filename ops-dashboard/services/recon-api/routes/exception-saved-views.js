const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

// =====================================================
// 1. GET /saved-views - Get all saved views for user
// =====================================================
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await pool.query(`
      SELECT 
        id,
        view_name as "name",
        description,
        query,
        owner_id as "ownerId",
        owner_name as "ownerName",
        shared,
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_used_at as "lastUsedAt",
        use_count as "useCount"
      FROM sp_v2_exception_saved_views
      WHERE owner_id = $1 OR shared = true
      ORDER BY use_count DESC, updated_at DESC
    `, [userId || 'SYSTEM']);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[Saved Views API] Error fetching views:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 2. POST /saved-views - Create new saved view
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { name, description, query, ownerId, ownerName, shared } = req.body;

    const result = await pool.query(`
      INSERT INTO sp_v2_exception_saved_views (
        view_name, description, query, owner_id, owner_name, shared
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        view_name as "name",
        description,
        query,
        owner_id as "ownerId",
        owner_name as "ownerName",
        shared,
        created_at as "createdAt"
    `, [name, description, JSON.stringify(query), ownerId, ownerName, shared || false]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Saved view created'
    });

  } catch (error) {
    console.error('[Saved Views API] Error creating view:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 3. PUT /saved-views/:id - Update saved view
// =====================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, query, shared } = req.body;

    const result = await pool.query(`
      UPDATE sp_v2_exception_saved_views
      SET 
        view_name = COALESCE($1, view_name),
        description = COALESCE($2, description),
        query = COALESCE($3, query),
        shared = COALESCE($4, shared),
        updated_at = NOW()
      WHERE id = $5
      RETURNING 
        id,
        view_name as "name",
        description,
        query,
        owner_id as "ownerId",
        owner_name as "ownerName",
        shared,
        updated_at as "updatedAt"
    `, [name, description, query ? JSON.stringify(query) : null, shared, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved view not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Saved view updated'
    });

  } catch (error) {
    console.error('[Saved Views API] Error updating view:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 4. DELETE /saved-views/:id - Delete saved view
// =====================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM sp_v2_exception_saved_views
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved view not found'
      });
    }

    res.json({
      success: true,
      message: 'Saved view deleted'
    });

  } catch (error) {
    console.error('[Saved Views API] Error deleting view:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// 5. POST /saved-views/:id/use - Track view usage
// =====================================================
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`
      UPDATE sp_v2_exception_saved_views
      SET 
        last_used_at = NOW(),
        use_count = use_count + 1
      WHERE id = $1
    `, [id]);

    res.json({
      success: true,
      message: 'View usage tracked'
    });

  } catch (error) {
    console.error('[Saved Views API] Error tracking usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
