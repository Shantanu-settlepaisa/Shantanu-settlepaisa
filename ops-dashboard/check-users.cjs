const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function checkUsers() {
  try {
    const result = await pool.query(`
      SELECT email, role, created_at
      FROM sp_v2_users
      ORDER BY created_at
      LIMIT 10
    `);

    console.log('Users in database:');
    console.log(JSON.stringify(result.rows, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
