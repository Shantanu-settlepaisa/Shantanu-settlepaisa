const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = 5109;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

console.log('📊 Recon Rules API - Connecting to PostgreSQL on port 5433...');

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected:', res.rows[0].now);
});

app.get('/api/recon-rules/rules', async (req, res) => {
  try {
    const { scope, status, search } = req.query;
    
    let query = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.scope,
        r.scope_type,
        r.match_chain,
        r.status,
        r.priority,
        r.version,
        r.created_by,
        r.updated_by,
        r.created_at,
        r.updated_at,
        COUNT(c.id) as condition_count
      FROM sp_v2_recon_rules r
      LEFT JOIN sp_v2_recon_rule_conditions c ON r.id = c.rule_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (scope && scope !== 'all') {
      params.push(scope);
      conditions.push(`r.scope_type = $${params.length}`);
    }
    
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(r.name ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += `
      GROUP BY r.id
      ORDER BY r.priority DESC, r.created_at DESC
    `;
    
    const result = await pool.query(query, params);
    
    res.json({
      rules: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

app.get('/api/recon-rules/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const ruleQuery = `
      SELECT * FROM sp_v2_recon_rules WHERE id = $1
    `;
    
    const conditionsQuery = `
      SELECT * FROM sp_v2_recon_rule_conditions WHERE rule_id = $1
      ORDER BY id ASC
    `;
    
    const ruleResult = await pool.query(ruleQuery, [id]);
    const conditionsResult = await pool.query(conditionsQuery, [id]);
    
    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    res.json({
      ...ruleResult.rows[0],
      conditions: conditionsResult.rows
    });
    
  } catch (error) {
    console.error('❌ Error fetching rule:', error);
    res.status(500).json({ error: 'Failed to fetch rule' });
  }
});

app.post('/api/recon-rules/rules', async (req, res) => {
  try {
    const {
      name,
      description,
      scope,
      scope_type = 'global',
      match_chain,
      status = 'draft',
      priority = 0,
      created_by,
      updated_by
    } = req.body;
    
    const id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const query = `
      INSERT INTO sp_v2_recon_rules (
        id, name, description, scope, scope_type, match_chain,
        status, priority, version, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id, name, description, scope, scope_type, match_chain,
      status, priority, created_by, updated_by
    ]);
    
    console.log('✅ Created rule:', id);
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

app.put('/api/recon-rules/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      scope,
      scope_type,
      match_chain,
      status,
      priority,
      updated_by
    } = req.body;
    
    const query = `
      UPDATE sp_v2_recon_rules
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        scope = COALESCE($3, scope),
        scope_type = COALESCE($4, scope_type),
        match_chain = COALESCE($5, match_chain),
        status = COALESCE($6, status),
        priority = COALESCE($7, priority),
        updated_by = COALESCE($8, updated_by),
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE id = $9
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      name, description, scope, scope_type, match_chain,
      status, priority, updated_by, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    console.log('✅ Updated rule:', id);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

app.delete('/api/recon-rules/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      DELETE FROM sp_v2_recon_rules WHERE id = $1
      RETURNING id
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    console.log('✅ Deleted rule:', id);
    res.json({ message: 'Rule deleted successfully', id });
    
  } catch (error) {
    console.error('❌ Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

app.post('/api/recon-rules/rules/:id/conditions', async (req, res) => {
  try {
    const { id } = req.params;
    const { condition_type, field_name, operator, value_json } = req.body;
    
    const query = `
      INSERT INTO sp_v2_recon_rule_conditions (
        rule_id, condition_type, field_name, operator, value_json
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id, condition_type, field_name, operator, value_json
    ]);
    
    console.log('✅ Added condition to rule:', id);
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error adding condition:', error);
    res.status(500).json({ error: 'Failed to add condition' });
  }
});

app.delete('/api/recon-rules/rules/:ruleId/conditions/:conditionId', async (req, res) => {
  try {
    const { ruleId, conditionId } = req.params;
    
    const query = `
      DELETE FROM sp_v2_recon_rule_conditions 
      WHERE id = $1 AND rule_id = $2
      RETURNING id
    `;
    
    const result = await pool.query(query, [conditionId, ruleId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Condition not found' });
    }
    
    console.log('✅ Deleted condition:', conditionId);
    res.json({ message: 'Condition deleted successfully', id: conditionId });
    
  } catch (error) {
    console.error('❌ Error deleting condition:', error);
    res.status(500).json({ error: 'Failed to delete condition' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'recon-rules-api', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🚀 Recon Rules API running on http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET    /api/recon-rules/rules - List all rules`);
  console.log(`   GET    /api/recon-rules/rules/:id - Get rule details`);
  console.log(`   POST   /api/recon-rules/rules - Create new rule`);
  console.log(`   PUT    /api/recon-rules/rules/:id - Update rule`);
  console.log(`   DELETE /api/recon-rules/rules/:id - Delete rule`);
  console.log(`   POST   /api/recon-rules/rules/:id/conditions - Add condition`);
  console.log(`   DELETE /api/recon-rules/rules/:ruleId/conditions/:conditionId - Delete condition`);
});
