const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function fixTrigger() {
  const client = await pool.connect();
  
  try {
    console.log('Fixing fn_create_exception_workflow trigger...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_create_exception_workflow()
      RETURNS TRIGGER AS $$
      DECLARE
          v_exception_id VARCHAR(50);
          v_severity VARCHAR(20);
          v_reason VARCHAR(50);
          v_sla_due_at TIMESTAMP WITH TIME ZONE;
          v_merchant_name VARCHAR(255);
          v_acquirer VARCHAR(50);
      BEGIN
          IF NEW.status = 'EXCEPTION' AND (OLD IS NULL OR OLD.status != 'EXCEPTION') THEN
              
              v_exception_id := 'EXC_' || TO_CHAR(NOW(), 'YYYYMMDD') || '_' || LPAD(nextval('exception_seq')::TEXT, 6, '0');
              v_reason := 'AMOUNT_MISMATCH';  -- Default reason
              v_severity := fn_determine_severity(NEW.amount_paise, v_reason);
              v_sla_due_at := fn_calculate_sla(v_reason, v_severity, NOW());
              v_merchant_name := COALESCE(NEW.merchant_id, 'UNKNOWN');
              v_acquirer := 'UNKNOWN';  -- Default acquirer
              
              INSERT INTO sp_v2_exception_workflow (
                  exception_id, transaction_id, reason, severity, status,
                  sla_due_at, pg_amount_paise, amount_delta_paise,
                  merchant_id, merchant_name, acquirer_code, cycle_date,
                  pg_transaction_id, utr, created_at
              ) VALUES (
                  v_exception_id, NEW.id, v_reason, v_severity, 'open',
                  v_sla_due_at, NEW.amount_paise, 0,
                  NEW.merchant_id, v_merchant_name, v_acquirer, NEW.transaction_date,
                  NEW.transaction_id, NEW.utr, NOW()
              );
              
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Trigger function fixed!');
    
  } finally {
    client.release();
    await pool.end();
  }
}

fixTrigger();
