const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    console.log('🔍 Checking existing users in database...\n');
    
    const result = await pool.query(`
      SELECT id, email, full_name, role, is_active, created_at
      FROM sp_v2_users
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No active users found in database');
      console.log('   We need to create a test user\n');
      
      // Create test admin user
      console.log('📝 Creating test admin user...');
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('test123', 10);
      
      const createResult = await pool.query(`
        INSERT INTO sp_v2_users (email, password_hash, full_name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE
        SET password_hash = $2, updated_at = NOW()
        RETURNING id, email, full_name, role;
      `, ['test@settlepaisa.com', passwordHash, 'Test Admin User', 'admin', true]);
      
      console.log('✅ Test user created/updated:');
      console.log(`   Email: ${createResult.rows[0].email}`);
      console.log(`   Password: test123`);
      console.log(`   Role: ${createResult.rows[0].role}\n`);
    } else {
      console.log(`✅ Found ${result.rows.length} active user(s):\n`);
      result.rows.forEach((user, i) => {
        console.log(`${i+1}. Email: ${user.email}`);
        console.log(`   Name: ${user.full_name}`);
        console.log(`   Role: ${user.role}`);
        console.log('');
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkUsers();
