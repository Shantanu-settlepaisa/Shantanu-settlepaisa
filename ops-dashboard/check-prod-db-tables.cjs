const { Pool } = require('pg');

const pool = new Pool({
  host: '3.108.237.99',
  port: 5432,
  database: 'settlepaisa_demo',
  user: 'settlepaisainternal_demo',
  password: 'sabpaisa@123',
});

async function checkDatabase() {
  try {
    console.log('🔌 Connecting to production database...\n');

    // 1. List all tables related to chargebacks, refunds, settlements
    console.log('📋 Tables related to chargebacks/refunds/settlements:');
    console.log('='.repeat(60));
    const tablesResult = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%chargeback%'
          OR table_name LIKE '%refund%'
          OR table_name LIKE '%settlement%')
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 0) {
      console.log('❌ No chargeback/refund/settlement tables found!');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  ✅ ${row.table_name} (${row.table_type})`);
      });
    }

    console.log('\n');

    // 2. Check if chargebacks table exists
    const hasChargebacks = tablesResult.rows.some(r => r.table_name === 'chargebacks');
    if (hasChargebacks) {
      console.log('🔍 Chargebacks table structure:');
      console.log('='.repeat(60));
      const chargebackSchema = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chargebacks'
        ORDER BY ordinal_position;
      `);
      chargebackSchema.rows.forEach(col => {
        console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Check data count
      const chargebackCount = await pool.query('SELECT COUNT(*) as count FROM chargebacks');
      console.log(`\n  📊 Total chargebacks: ${chargebackCount.rows[0].count}`);

      if (parseInt(chargebackCount.rows[0].count) > 0) {
        const statusBreakdown = await pool.query(`
          SELECT status, COUNT(*) as count
          FROM chargebacks
          GROUP BY status
          ORDER BY count DESC
        `);
        console.log('  📊 Status breakdown:');
        statusBreakdown.rows.forEach(row => {
          console.log(`     ${row.status}: ${row.count}`);
        });
      }
      console.log('\n');
    } else {
      console.log('❌ Chargebacks table does NOT exist\n');
    }

    // 3. Check if refunds table exists
    const hasRefunds = tablesResult.rows.some(r => r.table_name === 'refunds' || r.table_name === 'sp_v2_refunds');
    if (hasRefunds) {
      const refundsTableName = tablesResult.rows.find(r => r.table_name === 'refunds' || r.table_name === 'sp_v2_refunds').table_name;
      console.log(`🔍 ${refundsTableName} table structure:`);
      console.log('='.repeat(60));
      const refundSchema = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position;
      `, [refundsTableName]);
      refundSchema.rows.forEach(col => {
        console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Check data count
      const refundCount = await pool.query(`SELECT COUNT(*) as count FROM ${refundsTableName}`);
      console.log(`\n  📊 Total refunds: ${refundCount.rows[0].count}\n`);
    } else {
      console.log('❌ Refunds table does NOT exist\n');
    }

    // 4. Check settlement_batches structure
    const hasSettlementBatches = tablesResult.rows.some(r => r.table_name === 'sp_v2_settlement_batches');
    if (hasSettlementBatches) {
      console.log('🔍 Settlement batches table - checking for deduction columns:');
      console.log('='.repeat(60));
      const settlementCols = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sp_v2_settlement_batches'
          AND (column_name LIKE '%refund%' OR column_name LIKE '%chargeback%' OR column_name LIKE '%deduct%')
        ORDER BY ordinal_position;
      `);

      if (settlementCols.rows.length === 0) {
        console.log('  ❌ NO refund/chargeback deduction columns found in sp_v2_settlement_batches');
      } else {
        console.log('  ✅ Found deduction columns:');
        settlementCols.rows.forEach(col => {
          console.log(`     ${col.column_name}: ${col.data_type}`);
        });
      }
      console.log('\n');
    }

    // 5. Check migration history for chargeback/refund migrations
    console.log('🔍 Migration history (chargeback/refund related):');
    console.log('='.repeat(60));
    const hasFlyway = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'flyway_schema_history'
    `);

    if (hasFlyway.rows.length > 0) {
      const migrations = await pool.query(`
        SELECT version, description, installed_on, success
        FROM flyway_schema_history
        WHERE LOWER(description) LIKE '%chargeback%'
           OR LOWER(description) LIKE '%refund%'
        ORDER BY installed_on DESC;
      `);

      if (migrations.rows.length === 0) {
        console.log('  ⚠️  No chargeback/refund migrations found in history');
      } else {
        migrations.rows.forEach(mig => {
          console.log(`  ${mig.success ? '✅' : '❌'} V${mig.version}: ${mig.description}`);
          console.log(`     Installed: ${mig.installed_on}`);
        });
      }
    } else {
      console.log('  ⚠️  No flyway_schema_history table found');
    }

    console.log('\n');

    // 6. Summary
    console.log('📊 SUMMARY:');
    console.log('='.repeat(60));
    console.log(`  Chargebacks table exists: ${hasChargebacks ? '✅ YES' : '❌ NO'}`);
    console.log(`  Refunds table exists: ${hasRefunds ? '✅ YES' : '❌ NO'}`);
    console.log(`  Settlement batches table exists: ${hasSettlementBatches ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabase();
