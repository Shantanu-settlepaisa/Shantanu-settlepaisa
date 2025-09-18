// Use mock database for now (replace with ./db for real PostgreSQL)
const mockDB = require('./mock-db');

/**
 * Settlement Pipeline Service
 * Implements mutually-exclusive state tracking for settlement transactions
 */

/**
 * Get settlement pipeline data for a date range
 * @param {Date} fromDate - Start date (inclusive)
 * @param {Date} toDate - End date (exclusive)
 * @returns {Object} Pipeline data with counts and amounts for each state
 */
async function getSettlementPipeline(fromDate, toDate) {
  try {
    // Use mock database query
    const row = await mockDB.querySettlements(fromDate, toDate);
    
    // Validate data invariant: captured = sum of all states
    const sumOfStates = 
      row.in_settlement_count + 
      row.sent_to_bank_count + 
      row.credited_count + 
      row.unsettled_count;
    
    if (row.captured_count !== sumOfStates) {
      console.error('[Settlement Pipeline] INVARIANT VIOLATION:', {
        captured: row.captured_count,
        sum: sumOfStates,
        breakdown: {
          in_settlement: row.in_settlement_count,
          sent_to_bank: row.sent_to_bank_count,
          credited: row.credited_count,
          unsettled: row.unsettled_count
        }
      });
      throw new Error(`Data invariant violation: captured (${row.captured_count}) != sum of states (${sumOfStates})`);
    }
    
    // Format response matching the API contract
    const response = {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      captured: {
        count: row.captured_count,
        amountPaise: row.captured_amount_paise
      },
      inSettlement: {
        count: row.in_settlement_count,
        amountPaise: row.in_settlement_amount_paise
      },
      sentToBank: {
        count: row.sent_to_bank_count,
        amountPaise: row.sent_to_bank_amount_paise
      },
      credited: {
        count: row.credited_count,
        amountPaise: row.credited_amount_paise
      },
      unsettled: {
        count: row.unsettled_count,
        amountPaise: row.unsettled_amount_paise
      }
    };
    
    // Log successful response
    console.log('[Settlement Pipeline] Data fetched:', {
      range: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
      captured: row.captured_count,
      breakdown: `${row.in_settlement_count}/${row.sent_to_bank_count}/${row.credited_count}/${row.unsettled_count}`
    });
    
    return response;
  } catch (error) {
    console.error('[Settlement Pipeline] Error:', error);
    throw error;
  }
}

/**
 * Initialize database schema and seed data
 * Run this once to set up the settlement pipeline tables
 */
async function initializeDatabase() {
  try {
    // Initialize mock database
    const result = await mockDB.initializeSettlements();
    
    if (result) {
      console.log('[Settlement Pipeline] Mock database initialized successfully');
      
      // Get and log stats
      const stats = await mockDB.getSettlementStats();
      console.log('[Settlement Pipeline] Data verification:');
      stats.forEach(row => {
        console.log(`  ${row.state}: ${row.count} transactions`);
      });
    }
    
    return result;
  } catch (error) {
    console.error('[Settlement Pipeline] Initialization error:', error);
    return false;
  }
}

/**
 * Get settlement statistics for monitoring
 */
async function getSettlementStats() {
  return await mockDB.getSettlementStats();
}

module.exports = {
  getSettlementPipeline,
  initializeDatabase,
  getSettlementStats
};