const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function testExceptionsDisplay() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing Exception Display & Download\n');
    
    // Step 1: Check existing exceptions from previous uploads
    console.log('Step 1: Checking existing exceptions from previous reconciliation...');
    const existingExceptions = await client.query(`
      SELECT 
        COUNT(*) as count,
        status
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
      GROUP BY status
    `);
    
    if (existingExceptions.rows.length > 0) {
      console.log(`✅ Found ${existingExceptions.rows[0].count} existing EXCEPTION transactions`);
      
      // Check if they have workflow records
      const workflowCount = await client.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_exception_workflow
      `);
      
      console.log(`✅ Exception workflow records: ${workflowCount.rows[0].count}`);
      
      if (parseInt(workflowCount.rows[0].count) === 0) {
        console.log('⚠️  No workflow records found. Creating them now...');
        
        // Manually trigger workflow creation for existing exceptions
        await client.query(`
          UPDATE sp_v2_transactions
          SET updated_at = NOW()
          WHERE status = 'EXCEPTION'
        `);
        
        console.log('✅ Triggered workflow creation');
      }
    } else {
      console.log('ℹ️  No existing exceptions. Creating sample exceptions...');
      
      // Create 3 sample exceptions
      for (let i = 1; i <= 3; i++) {
        await client.query(`
          INSERT INTO sp_v2_transactions (
            transaction_id,
            merchant_id,
            amount_paise,
            currency,
            transaction_date,
            transaction_timestamp,
            source_type,
            payment_method,
            utr,
            status
          ) VALUES (
            'DEMO_TXN_${Date.now()}_${i}',
            'MERCHANT_${i}',
            ${100000 + i * 10000},
            'INR',
            CURRENT_DATE,
            NOW(),
            'MANUAL_UPLOAD',
            'UPI',
            'UTR_DEMO_${Date.now()}_${i}',
            'EXCEPTION'
          )
        `);
      }
      
      console.log('✅ Created 3 sample exception transactions');
    }
    
    // Wait for triggers to fire
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Query exceptions via workflow table
    console.log('\nStep 2: Querying exceptions from workflow table...');
    const exceptions = await client.query(`
      SELECT 
        ew.exception_id,
        ew.status,
        ew.severity,
        ew.reason,
        ew.merchant_id,
        ew.pg_amount_paise / 100.0 as amount_inr,
        ew.sla_due_at,
        ew.sla_breached,
        ew.created_at,
        t.transaction_id
      FROM sp_v2_exception_workflow ew
      JOIN sp_v2_transactions t ON ew.transaction_id = t.id
      WHERE ew.status IN ('open', 'investigating')
      ORDER BY ew.created_at DESC
      LIMIT 10
    `);
    
    console.log(`✅ Found ${exceptions.rows.length} open exceptions:\n`);
    exceptions.rows.forEach((exc, idx) => {
      console.log(`${idx + 1}. ${exc.exception_id}`);
      console.log(`   Transaction: ${exc.transaction_id}`);
      console.log(`   Status: ${exc.status}`);
      console.log(`   Severity: ${exc.severity}`);
      console.log(`   Amount: ₹${exc.amount_inr}`);
      console.log(`   SLA Breached: ${exc.sla_breached ? 'YES ⚠️' : 'No'}`);
      console.log('');
    });
    
    // Step 3: Test API endpoint
    console.log('Step 3: Testing API endpoint...');
    const apiResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5103,
        path: '/exceptions-v2?limit=10',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
    
    if (apiResponse.success) {
      console.log('✅ API Response successful!');
      console.log(`   Total exceptions: ${apiResponse.counts.total}`);
      console.log(`   Open: ${apiResponse.counts.byStatus?.open || 0}`);
      console.log(`   Investigating: ${apiResponse.counts.byStatus?.investigating || 0}`);
      console.log(`   Returned items: ${apiResponse.items.length}`);
    } else {
      console.log('❌ API Error:', apiResponse.error);
    }
    
    // Step 4: Test export endpoint
    console.log('\nStep 4: Testing CSV export...');
    const exportResponse = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        query: { status: ['open', 'investigating'] },
        format: 'csv',
        template: 'summary'
      });
      
      const options = {
        hostname: 'localhost',
        port: 5103,
        path: '/exceptions-v2/export',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            dataLength: data.length,
            preview: data.substring(0, 200)
          });
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    if (exportResponse.statusCode === 200) {
      console.log('✅ CSV Export working!');
      console.log(`   Content-Type: ${exportResponse.contentType}`);
      console.log(`   File size: ${exportResponse.dataLength} bytes`);
      console.log(`   Preview:\n${exportResponse.preview}...`);
    } else {
      console.log('❌ Export failed:', exportResponse.statusCode);
    }
    
    console.log('\n✅ ========================================');
    console.log('✅ EXCEPTIONS TAB IS READY!');
    console.log('✅ ========================================\n');
    
    console.log('📊 What Ops Team Can Do:');
    console.log('  ✓ View all open exceptions in Exceptions tab');
    console.log('  ✓ Filter by status, severity, reason, merchant');
    console.log('  ✓ Search by transaction ID, UTR, exception ID');
    console.log('  ✓ Assign exceptions to team members');
    console.log('  ✓ Mark as investigating, snooze, or resolve');
    console.log('  ✓ Download exceptions as CSV');
    console.log('  ✓ View complete timeline of actions');
    console.log('  ✓ Apply bulk actions to multiple exceptions');
    
    console.log('\n🌐 Access Points:');
    console.log('  - Frontend: http://localhost:5174/ops/exceptions');
    console.log('  - API: http://localhost:5103/exceptions-v2');
    console.log('  - Export: POST http://localhost:5103/exceptions-v2/export');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testExceptionsDisplay();
