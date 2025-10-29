const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,  // V2 database on port 5433
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkV2Database() {
  try {
    console.log('🔌 Connecting to V2 Local Database...\n');

    // 1. List ALL sp_v2_* tables
    console.log('📋 ALL V2 Tables (sp_v2_*):');
    console.log('='.repeat(80));
    const v2TablesResult = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'sp_v2_%'
      ORDER BY table_name;
    `);

    if (v2TablesResult.rows.length === 0) {
      console.log('  ❌ No V2 tables found!');
    } else {
      v2TablesResult.rows.forEach((row, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(3)}. ${row.table_name}`);
      });
      console.log(`\n  📊 Total V2 tables: ${v2TablesResult.rows.length}\n`);
    }

    // 2. Check for chargeback/refund tables
    console.log('🔍 Checking for Chargeback/Refund tables:');
    console.log('='.repeat(80));
    const hasChargebacks = v2TablesResult.rows.some(r => r.table_name.includes('chargeback'));
    const hasRefunds = v2TablesResult.rows.some(r => r.table_name.includes('refund'));

    console.log(`  Chargebacks table: ${hasChargebacks ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`  Refunds table: ${hasRefunds ? '✅ EXISTS' : '❌ MISSING'}`);

    if (hasChargebacks) {
      const chargebackTables = v2TablesResult.rows.filter(r => r.table_name.includes('chargeback'));
      console.log('  Chargeback-related tables:');
      chargebackTables.forEach(t => console.log(`    - ${t.table_name}`));
    }

    console.log('\n');

    // 3. Check settlement_batches structure
    console.log('🔍 sp_v2_settlement_batches table:');
    console.log('='.repeat(80));
    const hasSettlementBatches = v2TablesResult.rows.some(r => r.table_name === 'sp_v2_settlement_batches');

    if (hasSettlementBatches) {
      const batchSchema = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sp_v2_settlement_batches'
        ORDER BY ordinal_position;
      `);

      console.log('  ALL columns:');
      batchSchema.rows.forEach(col => {
        const marker = col.column_name.includes('refund') || col.column_name.includes('chargeback') || col.column_name.includes('deduct') ? '⚠️ ' : '  ';
        console.log(`  ${marker}${col.column_name.padEnd(40)} ${col.data_type.padEnd(20)}`);
      });

      const deductionCols = batchSchema.rows.filter(col =>
        col.column_name.includes('refund') ||
        col.column_name.includes('chargeback') ||
        col.column_name.includes('deduct')
      );

      if (deductionCols.length > 0) {
        console.log('\n  ✅ Found deduction-related columns:');
        deductionCols.forEach(col => console.log(`     ${col.column_name}: ${col.data_type}`));
      } else {
        console.log('\n  ❌ NO deduction columns (refunds_deducted, chargebacks_deducted)');
      }
    } else {
      console.log('  ❌ sp_v2_settlement_batches table NOT found!');
    }

    console.log('\n');

    // 4. Check transaction tables
    console.log('🔍 Transaction Tables:');
    console.log('='.repeat(80));
    const txnTables = v2TablesResult.rows.filter(r => r.table_name.includes('transaction'));
    if (txnTables.length > 0) {
      txnTables.forEach(t => console.log(`  ✅ ${t.table_name}`));
    } else {
      console.log('  ❌ No transaction tables found');
    }

    console.log('\n');

    // 5. Check migration history
    console.log('🔍 Migration History:');
    console.log('='.repeat(80));
    const hasFlyway = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'flyway_schema_history'
    `);

    if (hasFlyway.rows.length > 0) {
      const latestMigrations = await pool.query(`
        SELECT version, description, installed_on, success
        FROM flyway_schema_history
        ORDER BY installed_on DESC
        LIMIT 10;
      `);

      console.log('  Last 10 migrations:');
      latestMigrations.rows.forEach(mig => {
        console.log(`    ${mig.success ? '✅' : '❌'} V${mig.version}: ${mig.description}`);
      });

      // Check for chargeback migration
      const chargebackMig = await pool.query(`
        SELECT version, description, installed_on, success
        FROM flyway_schema_history
        WHERE LOWER(description) LIKE '%chargeback%'
      `);

      if (chargebackMig.rows.length > 0) {
        console.log('\n  Chargeback migration:');
        chargebackMig.rows.forEach(mig => {
          console.log(`    ${mig.success ? '✅' : '❌'} V${mig.version}: ${mig.description}`);
        });
      } else {
        console.log('\n  ⚠️  No chargeback migration found in history');
      }
    } else {
      console.log('  ⚠️  No flyway_schema_history table');
    }

    console.log('\n');

    // 6. Summary
    console.log('📊 V2 LOCAL DATABASE SUMMARY:');
    console.log('='.repeat(80));
    console.log(`  Total V2 tables: ${v2TablesResult.rows.length}`);
    console.log(`  Chargebacks table: ${hasChargebacks ? '✅ EXISTS' : '❌ MISSING - NEEDS CREATION'}`);
    console.log(`  Refunds table: ${hasRefunds ? '✅ EXISTS' : '❌ MISSING - NEEDS CREATION'}`);
    console.log(`  Settlement batches: ${hasSettlementBatches ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log('\n  🎯 Action Required:');
    if (!hasChargebacks) {
      console.log('     1. Create chargebacks table (run V011__chargebacks.sql migration)');
    }
    if (!hasRefunds) {
      console.log('     2. Create refunds table (new migration needed)');
    }
    if (hasSettlementBatches) {
      console.log('     3. Add deduction columns to sp_v2_settlement_batches');
    }
    console.log('     4. Create CSV upload API for refunds');
    console.log('     5. Update settlement calculator to deduct refunds/chargebacks\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkV2Database();
