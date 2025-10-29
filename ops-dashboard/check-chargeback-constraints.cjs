const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkConstraints() {
  try {
    console.log('🔍 Checking sp_v2_chargebacks table constraints...\n');

    // Check all constraints
    const constraints = await pool.query(`
      SELECT
        con.conname as constraint_name,
        con.contype as constraint_type,
        pg_get_constraintdef(con.oid) as constraint_definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'sp_v2_chargebacks'
      ORDER BY con.conname;
    `);

    console.log('📋 Table Constraints:\n');
    constraints.rows.forEach(row => {
      const typeMap = {
        'c': 'CHECK',
        'f': 'FOREIGN KEY',
        'p': 'PRIMARY KEY',
        'u': 'UNIQUE'
      };
      console.log(`${typeMap[row.constraint_type]}: ${row.constraint_name}`);
      console.log(`   ${row.constraint_definition}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkConstraints();
