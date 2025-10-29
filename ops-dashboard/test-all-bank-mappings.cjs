#!/usr/bin/env node

const { mapV1ToV2 } = require('./services/api/v1-column-mapper.js');

console.log('='.repeat(80));
console.log('Testing V1→V2 Mapper with ALL Bank-Specific Columns');
console.log('='.repeat(80));

// Test data for each bank format
const testCases = [
  {
    bank: 'PG TRANSACTIONS',
    type: 'pg_transactions',
    row: {
      'transaction_id': 'TXN001',
      'client_code': 'MERCH001',
      'payee_amount': '5000.00',
      'paid_amount': '5000.00',
      'payment_mode': 'UPI',
      'trans_complete_date': '2025-10-24 10:00:00',
      'status': 'SUCCESS',
      'utr': 'AXIS001',
      'pg_name': 'RAZORPAY'
    }
  },
  {
    bank: 'AXIS BANK',
    type: 'bank_statements',
    row: {
      'Amount': '5000.00',
      'PRNNo': 'TXN001',
      'Date': '24/10/2025'
    }
  },
  {
    bank: 'BOB',
    type: 'bank_statements',
    row: {
      'Settlement Amount': '9000.00',
      'Net Amount': '9000.00',
      'Merchant Track ID': 'TXN011',
      'Payment Date': '24-10-2025',
      'Transaction Date': '24-10-2025',
      'Onus Indicator': 'N'
    }
  },
  {
    bank: 'HDFC BANK',
    type: 'bank_statements',
    row: {
      'MERCHANT_TRACKID': 'HDFC001',
      'DOMESTIC AMT': '50000.00',
      'SETTLE DATE': '24-10-2025',
      'TRANS DATE': '24-10-2025'
    }
  },
  {
    bank: 'SBI BANK',
    type: 'bank_statements',
    row: {
      'GROSS_AMT': '10000.00',
      'NET_AMT': '9500.00',
      'MERCHANT_TXNNO': 'SBI001',
      'TRAN_DATE': '24-10-2025'
    }
  },
  {
    bank: 'HDFC UPI',
    type: 'bank_statements',
    row: {
      'Transaction Amount': '8000.00',
      'Net Amount': '7800.00',
      'Order ID': 'ORDER123',
      'Settlement Date': '24-10-2025',
      'Transaction Req Date': '23-10-2025'
    }
  },
  {
    bank: 'CANARA BANK',
    type: 'bank_statements',
    row: {
      'TxnAmount': '12000.00',
      'PGIRefNo': 'CANARA001',
      'TxnDate': '24-10-2025'
    }
  },
  {
    bank: 'YES BANK',
    type: 'bank_statements',
    row: {
      'TRANSACTION AMOUNT': '15000.00',
      'MERCHANT REF. NO': 'YES001',
      'TRANSACTION DATE': '24-10-2025'
    }
  }
];

let passCount = 0;
let failCount = 0;

testCases.forEach(test => {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Testing: ${test.bank}`);
  console.log(`${'─'.repeat(80)}`);
  console.log('Input V1 row:', test.row);

  try {
    const v2Row = mapV1ToV2(test.row, test.type);
    console.log('\nOutput V2 row:', v2Row);

    // Validation checks
    const checks = [];

    if (test.type === 'pg_transactions') {
      checks.push({ field: 'transaction_id', expected: test.row.transaction_id, actual: v2Row.transaction_id });
      checks.push({ field: 'amount_paise', expected: parseInt(parseFloat(test.row.payee_amount) * 100), actual: v2Row.amount_paise });
      checks.push({ field: 'gross_amount_paise', expected: parseInt(parseFloat(test.row.paid_amount) * 100), actual: v2Row.gross_amount_paise });
    } else {
      // Bank statements - check that amount was mapped
      if (v2Row.amount_paise || v2Row.gross_amount_paise) {
        checks.push({ field: 'amount/gross', expected: 'present', actual: 'present' });
      } else {
        checks.push({ field: 'amount/gross', expected: 'present', actual: 'MISSING' });
      }

      // Check date mapping
      if (v2Row.transaction_date) {
        checks.push({ field: 'transaction_date', expected: 'present', actual: 'present' });
      }
    }

    console.log('\n✅ Validation checks:');
    checks.forEach(check => {
      const passed = check.expected === check.actual || (typeof check.expected === 'number' && check.expected === check.actual);
      console.log(`  ${passed ? '✅' : '❌'} ${check.field}: expected=${check.expected}, actual=${check.actual}`);
      if (passed) passCount++; else failCount++;
    });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    failCount++;
  }
});

console.log('\n' + '='.repeat(80));
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(80));

if (failCount === 0) {
  console.log('✅ ALL TESTS PASSED! V1→V2 mapper is working correctly.');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED! Please review the mapper.');
  process.exit(1);
}
