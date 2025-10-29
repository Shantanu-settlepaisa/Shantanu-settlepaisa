#!/usr/bin/env node

// Test the mapper EXACTLY as it exists on EC2

const v1AxisRow = {
  Date: '24/10/2025',
  UTR: 'AXIS001',
  'Transaction Ref': 'TXN004',
  Debit: '0.00',
  Credit: '5000.00',
  Status: 'SUCCESS'
};

const v1IciciRow = {
  'Transaction Date': '24-Oct-2025',
  'Value Date': '24-Oct-2025',
  UTR: 'ICICI001',
  'Transaction Remarks': 'UPI-TXN046',
  'Withdrawal Amount': '0.00',
  'Deposit Amount': '9000.00',
  Balance: '1234567.00'
};

console.log('Sending Axis row to Recon API mapper test:');
console.log(JSON.stringify(v1AxisRow));

console.log('\\nSending ICICI row to Recon API mapper test:');
console.log(JSON.stringify(v1IciciRow));

const axios = require('axios');

async function testMapper() {
  try {
    // Test AXIS
    const axisResponse = await axios.post('http://13.201.179.44:5103/recon/test-mapper', {
      type: 'bank_statements',
      row: v1AxisRow
    });
    console.log('\\nAXIS Result:', JSON.stringify(axisResponse.data, null, 2));

    // Test ICICI
    const iciciResponse = await axios.post('http://13.201.179.44:5103/recon/test-mapper', {
      type: 'bank_statements',
      row: v1IciciRow
    });
    console.log('\\nICICI Result:', JSON.stringify(iciciResponse.data, null, 2));
  } catch (error) {
    console.error('Error testing mapper:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testMapper();
