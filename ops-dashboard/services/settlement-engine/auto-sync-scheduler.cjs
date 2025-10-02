const cron = require('node-cron');
const { SabPaisaConfigSync } = require('./sync-sabpaisa-configs.cjs');

class AutoSyncScheduler {
  constructor() {
    this.sync = new SabPaisaConfigSync();
    this.cronJob = null;
  }
  
  start() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║       V2 SETTLEPAISA AUTO-SYNC SCHEDULER              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    // Sync merchant configs daily at 2 AM
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      console.log('\n[Auto-Sync] Starting daily config sync at 2 AM...');
      const startTime = Date.now();
      
      try {
        await this.sync.syncAll();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Auto-sync completed in ${duration}s`);
      } catch (error) {
        console.error('\n❌ Auto-sync failed:', error.message);
        // TODO: Send alert notification
      }
    });
    
    console.log('✅ Auto-sync scheduler started');
    console.log('   Schedule: Daily at 2:00 AM');
    console.log('   Syncs: Merchant configs, Commission rates, Fee bearer configs');
    console.log('\nPress Ctrl+C to stop\n');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[Auto-Sync] Shutting down gracefully...');
      if (this.cronJob) {
        this.cronJob.stop();
      }
      this.sync.close();
      process.exit(0);
    });
  }
  
  async runNow() {
    console.log('[Auto-Sync] Running manual sync...\n');
    await this.sync.syncAll();
  }
}

module.exports = { AutoSyncScheduler };

if (require.main === module) {
  const scheduler = new AutoSyncScheduler();
  
  const arg = process.argv[2];
  
  if (arg === '--now') {
    // Run sync immediately
    scheduler.runNow()
      .then(() => {
        console.log('\n✅ Manual sync completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('\n❌ Manual sync failed:', error);
        process.exit(1);
      });
  } else {
    // Start scheduler
    scheduler.start();
  }
}
