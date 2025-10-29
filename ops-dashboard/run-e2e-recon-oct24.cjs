const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

// Parse CSV file
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Parse tilde-delimited TXT file
function parseTildeFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator: '~' }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

(async () => {
  try {
    console.log('📁 Reading test files...\n');

    // Read PG transactions (already uploaded)
    console.log('✅ PG Transactions: Already uploaded (15 records)');

    // Read bank files
    const hdfcData = await parseCSV('/Users/shantanusingh/ops-dashboard/HDFC_BANK_Oct24.csv');
    console.log(`✅ HDFC Bank: ${hdfcData.length} records`);

    const axisData = await parseTildeFile('/Users/shantanusingh/ops-dashboard/AXIS_BANK_Oct24.txt');
    console.log(`✅ AXIS Bank: ${axisData.length} records`);

    const sbiData = await parseCSV('/Users/shantanusingh/ops-dashboard/SBI_BANK_Oct24.csv');
    console.log(`✅ SBI Bank: ${sbiData.length} records`);

    // Combine all bank records
    const allBankRecords = [
      ...hdfcData.map(r => ({ ...r, _source_file: 'HDFC_BANK_Oct24.csv' })),
      ...axisData.map(r => ({ ...r, _source_file: 'AXIS_BANK_Oct24.txt' })),
      ...sbiData.map(r => ({ ...r, _source_file: 'SBI_BANK_Oct24.csv' }))
    ];

    console.log(`\n📊 Total bank records: ${allBankRecords.length}`);
    console.log('\n🚀 Running reconciliation...\n');

    // Run reconciliation
    const response = await axios.post('http://13.201.179.44:5103/recon/run', {
      date: '2025-10-22',
      merchantId: 'MERCH001',
      test: true,
      bankRecords: allBankRecords
    });

    console.log('✅ Reconciliation job started:');
    console.log(JSON.stringify(response.data, null, 2));

    // Wait a bit for job to complete
    const jobId = response.data.jobId;
    console.log(`\n⏳ Waiting for job ${jobId} to complete...\n`);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get job status
    const jobResponse = await axios.get(`http://13.201.179.44:5103/recon/jobs/${jobId}`);
    console.log('📋 Job Status:');
    console.log(JSON.stringify(jobResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
})();
