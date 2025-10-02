const { db } = require('./config');

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
        ('HDFC', '/data/settlements/HDFC_SETTLEMENT_${today.replace(/-/g, '')}_003.csv', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_003.csv', '${today}', 212992, 'VALIDATED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
        ('HDFC', '/data/settlements/HDFC_SETTLEMENT_${today.replace(/-/g, '')}_004.csv', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_004.csv', '${today}', 0, 'FAILED', NOW() - INTERVAL '1 hour', NULL)
      ON CONFLICT (bank, filename) DO NOTHING
    `);

    // Insert mock file expectations
    await db.query(`
      INSERT INTO file_expectations (bank, window_start, window_end, business_date, expected_name, expected_seq, required, received, received_at)
      VALUES 
        ('AXIS', '${today} 11:30:00', '${today} 12:30:00', '${today}', 'AXIS_SETTLE_${today}_01.csv', 1, true, true, NOW() - INTERVAL '3 hours'),
        ('AXIS', '${today} 15:30:00', '${today} 16:30:00', '${today}', 'AXIS_SETTLE_${today}_02.csv', 2, true, true, NOW() - INTERVAL '2 hours'),
        ('AXIS', '${today} 20:00:00', '${today} 21:00:00', '${today}', 'AXIS_SETTLE_${today}_03.csv', 3, true, true, NOW() - INTERVAL '30 minutes'),
        ('HDFC', '${today} 10:00:00', '${today} 10:45:00', '${today}', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_001.csv', 1, true, true, NOW() - INTERVAL '4 hours'),
        ('HDFC', '${today} 14:00:00', '${today} 14:45:00', '${today}', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_002.csv', 2, true, true, NOW() - INTERVAL '3 hours'),
        ('HDFC', '${today} 18:00:00', '${today} 18:45:00', '${today}', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_003.csv', 3, true, true, NOW() - INTERVAL '2 hours'),
        ('HDFC', '${today} 22:00:00', '${today} 22:45:00', '${today}', 'HDFC_SETTLEMENT_${today.replace(/-/g, '')}_004.csv', 4, true, false, NULL),
        ('ICICI', '${today} 09:30:00', '${today} 11:00:00', '${today}', 'ICICI_${today.replace(/-/g, '')}_SETTLE.csv', null, true, false, NULL),
        ('ICICI', '${today} 21:30:00', '${today} 23:00:00', '${today}', 'ICICI_${today.replace(/-/g, '')}_SETTLE_EOD.csv', null, true, false, NULL)
      ON CONFLICT (bank, business_date, expected_name) DO NOTHING
    `);

    console.log('Mock data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding mock data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedMockData();
}