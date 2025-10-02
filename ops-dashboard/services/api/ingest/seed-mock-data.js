const { Pool } = require('pg');

const db = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'settlepaisa_ops'
});

async function seedMockData() {
  console.log('Seeding mock data for SFTP ingestion...');

  try {
    // Insert mock connector health data
    await db.query(`
      INSERT INTO connector_health (bank, last_file_at, expected_count, received_count, lag_minutes, window_status, message)
      VALUES 
        ('AXIS', NOW() - INTERVAL '30 minutes', 3, 3, 30, 'HEALTHY', 'All files received'),
        ('HDFC', NOW() - INTERVAL '2 hours', 4, 3, 120, 'DEGRADED', 'Missing 1 file'),
        ('ICICI', NOW() - INTERVAL '8 hours', 2, 0, 480, 'DOWN', 'No files received')
      ON CONFLICT (bank) DO UPDATE SET
        last_file_at = EXCLUDED.last_file_at,
        expected_count = EXCLUDED.expected_count,
        received_count = EXCLUDED.received_count,
        lag_minutes = EXCLUDED.lag_minutes,
        window_status = EXCLUDED.window_status,
        message = EXCLUDED.message,
        updated_at = NOW()
    `);

    // Insert mock ingested files
    const today = new Date().toISOString().split('T')[0];
    await db.query(`
      INSERT INTO ingested_files (bank, remote_path, filename, business_date, size_bytes, status, seen_at, validated_at)
      VALUES 
        ('AXIS', '/outbound/settlement/AXIS_SETTLE_${today}_01.csv', 'AXIS_SETTLE_${today}_01.csv', '${today}', 102400, 'VALIDATED', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
        ('AXIS', '/outbound/settlement/AXIS_SETTLE_${today}_02.csv', 'AXIS_SETTLE_${today}_02.csv', '${today}', 98304, 'VALIDATED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
        ('AXIS', '/outbound/settlement/AXIS_SETTLE_${today}_03.csv', 'AXIS_SETTLE_${today}_03.csv', '${today}', 110592, 'VALIDATED', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes'),
        ('HDFC', '/data/settlements/HDFC_SETTLEMENT_${today.replace(/-/g, '')}_001.csv', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_001.csv', '${today}', 204800, 'VALIDATED', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'),
        ('HDFC', '/data/settlements/HDFC_SETTLEMENT_${today.replace(/-/g, '')}_002.csv', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_002.csv', '${today}', 196608, 'VALIDATED', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
        ('HDFC', '/data/settlements/HDFC_SETTLEMENT_${today.replace(/-/g, '')}_003.csv', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_003.csv', '${today}', 212992, 'VALIDATED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
      ON CONFLICT (bank, filename) DO NOTHING
    `);

    console.log('Mock data seeded successfully!');
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding mock data:', error);
    await db.end();
    process.exit(1);
  }
}

seedMockData();