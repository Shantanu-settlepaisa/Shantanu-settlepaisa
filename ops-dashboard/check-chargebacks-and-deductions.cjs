const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkTables() {
  try {
    console.log('🔍 Checking sp_v2_chargebacks table structure:\n');
    console.log('='.repeat(80));

    const chargebackSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_chargebacks'
      ORDER BY ordinal_position;
    `);

    chargebackSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(35)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check data
    const chargebackCount = await pool.query('SELECT COUNT(*) as count FROM sp_v2_chargebacks');
    console.log(`\n  📊 Total chargebacks: ${chargebackCount.rows[0].count}\n`);

    console.log('\n🔍 Checking sp_v2_settlement_deductions table structure:\n');
    console.log('='.repeat(80));

    const deductionSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_settlement_deductions'
      ORDER BY ordinal_position;
    `);

    if (deductionSchema.rows.length > 0) {
      console.log('  ✅ sp_v2_settlement_deductions table EXISTS:\n');
      deductionSchema.rows.forEach(col => {
        console.log(`  ${col.column_name.padEnd(35)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Check data
      const deductionCount = await pool.query('SELECT COUNT(*) as count FROM sp_v2_settlement_deductions');
      console.log(`\n  📊 Total deductions: ${deductionCount.rows[0].count}`);

      // Check deduction types
      const deductionTypes = await pool.query(`
        SELECT deduction_type, COUNT(*) as count
        FROM sp_v2_settlement_deductions
        GROUP BY deduction_type
      `);

      if (deductionTypes.rows.length > 0) {
        console.log('  📊 Deduction types:');
        deductionTypes.rows.forEach(row => {
          console.log(`     ${row.deduction_type}: ${row.count}`);
        });
      }
    } else {
      console.log('  ⚠️  sp_v2_settlement_deductions table structure not found');
    }

    console.log('\n');

    // Check if there are any existing relationships
    console.log('🔍 Checking Foreign Key relationships:\n');
    console.log('='.repeat(80));

    const fkCheck = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (tc.table_name = 'sp_v2_chargebacks'
          OR tc.table_name = 'sp_v2_settlement_deductions')
      ORDER BY tc.table_name;
    `);

    if (fkCheck.rows.length > 0) {
      console.log('  Foreign keys found:');
      fkCheck.rows.forEach(row => {
        console.log(`  ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
      });
    } else {
      console.log('  ⚠️  No foreign keys found for these tables');
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
