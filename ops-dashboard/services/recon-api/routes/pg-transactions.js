const express = require('express');
const router = express.Router();
const { syncPgTransactions, getPgTransactions } = require('../services/pg-sync-service');

router.get('/fetch', async (req, res) => {
  try {
    const { cycle_date, merchant_id } = req.query;
    
    if (!cycle_date) {
      return res.status(400).json({
        success: false,
        error: 'cycle_date parameter is required'
      });
    }
    
    console.log(`[PG API] Fetch request: cycle_date=${cycle_date}, merchant_id=${merchant_id || 'ALL'}`);
    
    const existingData = await getPgTransactions(cycle_date, merchant_id);
    
    if (existingData.count > 0) {
      const hasApiSync = existingData.source_breakdown['API_SYNC'] > 0;
      
      if (hasApiSync) {
        console.log(`[PG API] Returning existing API_SYNC data: ${existingData.count} transactions`);
        return res.json({
          success: true,
          data_available: true,
          already_synced: true,
          count: existingData.count,
          transactions: existingData.transactions,
          source_breakdown: existingData.source_breakdown,
          message: `${existingData.count} transactions already available for ${cycle_date}`
        });
      } else {
        console.log(`[PG API] Found MANUAL_UPLOAD data, attempting API sync...`);
      }
    }
    
    console.log(`[PG API] No API_SYNC data found, syncing from SabPaisa API...`);
    
    const syncResult = await syncPgTransactions(cycle_date, merchant_id || 'ALL');
    
    if (!syncResult.success) {
      return res.status(500).json({
        success: false,
        error: syncResult.message || 'Sync failed'
      });
    }
    
    const newData = await getPgTransactions(cycle_date, merchant_id);
    
    return res.json({
      success: true,
      data_available: true,
      freshly_synced: true,
      count: newData.count,
      transactions: newData.transactions,
      source_breakdown: newData.source_breakdown,
      message: syncResult.message,
      sync_stats: syncResult.stats
    });
    
  } catch (error) {
    console.error('[PG API] Error in /fetch:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch PG transactions. Please try manual upload.'
    });
  }
});

router.get('/check', async (req, res) => {
  try {
    const { cycle_date, merchant_id } = req.query;
    
    if (!cycle_date) {
      return res.status(400).json({
        success: false,
        error: 'cycle_date parameter is required'
      });
    }
    
    const existingData = await getPgTransactions(cycle_date, merchant_id);
    
    return res.json({
      success: true,
      data_available: existingData.count > 0,
      count: existingData.count,
      source_breakdown: existingData.source_breakdown
    });
    
  } catch (error) {
    console.error('[PG API] Error in /check:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/sync/manual', async (req, res) => {
  try {
    const { cycle_date, merchant_codes } = req.body;
    
    if (!cycle_date) {
      return res.status(400).json({
        success: false,
        error: 'cycle_date is required'
      });
    }
    
    const { runManualSync } = require('../jobs/daily-pg-sync');
    const merchants = merchant_codes || ['ALL'];
    
    console.log(`[Manual Sync API] Triggered for ${cycle_date}, merchants: ${merchants.join(', ')}`);
    
    const result = await runManualSync(cycle_date, merchants);
    
    return res.json({
      success: true,
      cycle_date,
      merchants_processed: merchants.length,
      merchants_success: result.success.length,
      merchants_failed: result.failed.length,
      total_synced: result.totalSynced,
      duration_seconds: result.duration,
      details: {
        success: result.success,
        failed: result.failed
      }
    });
    
  } catch (error) {
    console.error('[Manual Sync API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
