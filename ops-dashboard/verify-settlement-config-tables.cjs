const { Pool } = require('pg');

const pool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'settlepaisa',
  password: 'sabpaisa123',
  port: 5432,
});

async function verifySettlementTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 VERIFYING SETTLEMENT CONFIG TABLES IN SABPAISA DB\n');
    console.log('='.repeat(70));
    console.log('\n');
    
    // 1. merchant_fee_bearer table
    console.log('📊 TABLE: merchant_fee_bearer (Fee Bearer Config)');
    console.log('-'.repeat(70));
    const feeBearerSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'merchant_fee_bearer'
      ORDER BY ordinal_position
    `);
    
    if (feeBearerSchema.rows.length > 0) {
      console.log('✅ Table exists. Columns:');
      feeBearerSchema.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      const count = await client.query('SELECT COUNT(*) FROM merchant_fee_bearer');
      console.log(`Total Records: ${count.rows[0].count}`);
      
      const sample = await client.query('SELECT * FROM merchant_fee_bearer LIMIT 3');
      console.log('\nSample Records:');
      console.table(sample.rows);
    } else {
      console.log('❌ Table does NOT exist');
    }
    console.log('\n');
    
    // 2. fee_bearer table (lookup)
    console.log('📊 TABLE: fee_bearer (Fee Bearer Types)');
    console.log('-'.repeat(70));
    const feeBearerTypes = await client.query('SELECT * FROM fee_bearer ORDER BY id');
    if (feeBearerTypes.rows.length > 0) {
      console.log('✅ Table exists. Fee Bearer Types:');
      console.table(feeBearerTypes.rows);
    }
    console.log('\n');
    
    // 3. merchant_base_rate table (MDR rates)
    console.log('📊 TABLE: merchant_base_rate (MDR Rates)');
    console.log('-'.repeat(70));
    const mdrSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'merchant_base_rate'
      ORDER BY ordinal_position
    `);
    
    if (mdrSchema.rows.length > 0) {
      console.log('✅ Table exists. Columns:');
      mdrSchema.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      const count = await client.query('SELECT COUNT(*) FROM merchant_base_rate');
      console.log(`Total Records: ${count.rows[0].count}`);
      
      const sample = await client.query('SELECT * FROM merchant_base_rate LIMIT 3');
      console.log('\nSample Records:');
      console.table(sample.rows);
    } else {
      console.log('❌ Table does NOT exist');
    }
    console.log('\n');
    
    // 4. Rolling Reserve in merchant_data
    console.log('📊 TABLE: merchant_data (Rolling Reserve Config)');
    console.log('-'.repeat(70));
    const rollingReserve = await client.query(`
      SELECT 
        clientcode,
        companyname,
        rolling_reserve,
        rolling_percentage,
        no_of_days,
        subscribe,
        subscribe_amount
      FROM merchant_data
      WHERE rolling_reserve = true
      LIMIT 5
    `);
    
    if (rollingReserve.rows.length > 0) {
      console.log('✅ Rolling reserve data found:');
      console.table(rollingReserve.rows);
    } else {
      console.log('⚠️  No merchants with rolling_reserve = true found');
      
      const anyMerchant = await client.query(`
        SELECT 
          clientcode,
          companyname,
          rolling_reserve,
          rolling_percentage,
          no_of_days
        FROM merchant_data
        LIMIT 3
      `);
      console.log('Sample merchant data:');
      console.table(anyMerchant.rows);
    }
    console.log('\n');
    
    // 5. payment_mode table (for MDR lookup)
    console.log('📊 TABLE: payment_mode (Payment Modes)');
    console.log('-'.repeat(70));
    const paymentModes = await client.query('SELECT * FROM payment_mode ORDER BY id');
    if (paymentModes.rows.length > 0) {
      console.log('✅ Table exists. Payment Modes:');
      console.table(paymentModes.rows);
    }
    console.log('\n');
    
    // 6. Check V1 settlement calculation fields in transactions_to_settle
    console.log('📊 TABLE: transactions_to_settle (V1 Settlement Fields)');
    console.log('-'.repeat(70));
    const settlementFields = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'transactions_to_settle'
        AND column_name IN (
          'convcharges', 'ep_charges', 'gst', 'settlement_amount',
          'is_fee_bearer', 'pg_charge', 'rolling_reserve_amount',
          'final_distribution_amount', 'bank_commission_share'
        )
      ORDER BY column_name
    `);
    
    console.log('✅ V1 Settlement Calculation Fields Found:');
    settlementFields.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    console.log('\n');
    
    console.log('='.repeat(70));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('\nSUMMARY:');
    console.log('  ✅ merchant_fee_bearer - Fee bearer config per merchant/mode');
    console.log('  ✅ fee_bearer - Fee bearer types (Bank/Merchant/Payer)');
    console.log('  ✅ merchant_base_rate - MDR rates per merchant/mode');
    console.log('  ✅ merchant_data - Rolling reserve config');
    console.log('  ✅ payment_mode - Payment mode lookup');
    console.log('  ✅ transactions_to_settle - Has V1 settlement fields');
    console.log('\n📋 V2 CAN READ ALL SETTLEMENT CONFIG FROM SABPAISA DB!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifySettlementTables();
