const { SettlementScheduler } = require('./settlement-scheduler.cjs');

async function runManualSettlement() {
  const scheduler = new SettlementScheduler();
  
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
  }
  
  console.log('[Manual Settlement] Running with options:', options);
  
  try {
    const result = await scheduler.runSettlement(
      'manual',
      options.triggeredBy || 'admin',
      {
        merchantId: options.merchant,
        fromDate: options.from,
        toDate: options.to
      }
    );
    
    console.log('\n✅ Settlement completed successfully!');
    console.log('Run ID:', result.runId);
    console.log('Status:', result.status);
    console.log('Merchants Processed:', result.merchantsProcessed);
    console.log('Batches Created:', result.batchesCreated);
    console.log('Total Settled:', `₹${(result.totalAmountSettled / 100).toFixed(2)}`);
    
    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.merchant_id || 'Unknown'}: ${err.error}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Settlement failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await scheduler.close();
  }
}

console.log(`
╔════════════════════════════════════════════════════════╗
║     SETTLEPAISA V2 - MANUAL SETTLEMENT TRIGGER        ║
╚════════════════════════════════════════════════════════╝

Usage:
  node manual-settlement-trigger.cjs [options]

Options:
  --merchant <id>       Settle specific merchant only
  --from <YYYY-MM-DD>   Start date for transactions
  --to <YYYY-MM-DD>     End date for transactions
  --triggeredBy <name>  Who triggered this run (default: admin)

Examples:
  # Settle all merchants for date range
  node manual-settlement-trigger.cjs --from 2025-09-22 --to 2025-10-01

  # Settle specific merchant
  node manual-settlement-trigger.cjs --merchant MERCH001 --from 2025-09-01 --to 2025-09-30
  
  # Settle all pending (no date filter)
  node manual-settlement-trigger.cjs

-----------------------------------------------------------
`);

runManualSettlement();
