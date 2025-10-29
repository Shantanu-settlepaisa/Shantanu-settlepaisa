#!/usr/bin/env node

const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const RECON_API_URL = 'http://13.201.179.44:5103';

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function uploadAndRecon() {
  try {
    console.log('📁 [Step 1] Parsing CSV files...\n');

    // Parse all 4 CSV files
    const pgData = await parseCSV('./test-pg-transactions-2025-10-24.csv');
    const hdfcData = await parseCSV('./test-hdfc-statements-2025-10-24.csv');
    const axisData = await parseCSV('./test-axis-statements-2025-10-24.csv');
    const iciciData = await parseCSV('./test-icici-statements-2025-10-24.csv');

    console.log(`✅ PG Transactions: ${pgData.length} rows`);
    console.log(`✅ HDFC Statements: ${hdfcData.length} rows`);
    console.log(`✅ Axis Statements: ${axisData.length} rows`);
    console.log(`✅ ICICI Statements: ${iciciData.length} rows`);

    // Combine all bank statements
    const allBankData = [...hdfcData, ...axisData, ...iciciData];
    console.log(`\n📊 Total Bank Records: ${allBankData.length}\n`);

    console.log('🚀 [Step 2] Sending to Recon API...\n');

    // Send to Recon API
    const response = await axios.post(`${RECON_API_URL}/recon/run`, {
      date: '2025-10-24',
      dryRun: false,
      pgTransactions: pgData,
      bankRecords: allBankData,
      bankFilename: 'multi-bank-upload.csv'
    });

    console.log('✅ [Recon API Response]');
    console.log(JSON.stringify(response.data, null, 2));

    // Poll for job completion
    if (response.data.jobId) {
      console.log(`\n⏳ [Step 3] Waiting for job ${response.data.jobId} to complete...\n`);

      let attempts = 0;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const jobStatus = await axios.get(`${RECON_API_URL}/recon/jobs/${response.data.jobId}`);
        console.log(`Status: ${jobStatus.data.status} | Stage: ${jobStatus.data.stage}`);

        if (jobStatus.data.status === 'COMPLETED') {
          console.log('\n🎉 Reconciliation COMPLETED!\n');
          console.log('📊 Results:');
          console.log(JSON.stringify(jobStatus.data.counters, null, 2));
          break;
        } else if (jobStatus.data.status === 'FAILED') {
          console.log('\n❌ Reconciliation FAILED!');
          console.log('Error:', jobStatus.data.error);
          break;
        }

        attempts++;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

uploadAndRecon();
