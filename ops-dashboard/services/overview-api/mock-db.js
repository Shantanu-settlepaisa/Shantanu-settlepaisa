// Mock Database Implementation for Settlement Pipeline
// This simulates PostgreSQL behavior without requiring actual database

class MockDatabase {
  constructor() {
    this.settlements = [];
    this.initialized = false;
  }
  
  // Initialize with demo data
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    console.log('[Mock DB] Initializing settlement pipeline data...');
    
    // Clear existing data
    this.settlements = [];
    
    // Generate demo data with exact distribution
    const now = new Date();
    const distributions = [
      { state: 'IN_SETTLEMENT', count: 237 },
      { state: 'SENT_TO_BANK', count: 575 },
      { state: 'CREDITED', count: 1338 },
      { state: 'UNSETTLED', count: 100 }
    ];
    
    const modes = ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'QR'];
    let id = 1;
    
    for (const dist of distributions) {
      for (let i = 0; i < dist.count; i++) {
        const daysAgo = Math.floor(Math.random() * 14);
        const capturedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        
        this.settlements.push({
          id: id++,
          utr: `UTR${Date.now()}${dist.state}${String(i).padStart(4, '0')}`,
          amount_paise: Math.floor(10000 + Math.random() * 490000), // 100 to 5000 INR in paise
          mode: modes[Math.floor(Math.random() * modes.length)],
          captured_at: capturedAt,
          state: dist.state,
          state_at: new Date(capturedAt.getTime() + 3600000), // 1 hour after capture
          merchant_id: 'demo-merchant'
        });
      }
    }
    
    this.initialized = true;
    
    // Log verification
    const total = this.settlements.length;
    const byState = {};
    for (const s of this.settlements) {
      byState[s.state] = (byState[s.state] || 0) + 1;
    }
    
    console.log('[Mock DB] Initialized with data:');
    console.log(`  Total: ${total} transactions`);
    for (const [state, count] of Object.entries(byState)) {
      console.log(`  ${state}: ${count}`);
    }
    
    return true;
  }
  
  // Query settlements for date range
  async querySettlements(fromDate, toDate) {
    // Ensure data is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Filter by date range
    const filtered = this.settlements.filter(s => {
      const capturedAt = new Date(s.captured_at);
      return capturedAt >= fromDate && capturedAt < toDate;
    });
    
    // Aggregate data
    const result = {
      captured_count: filtered.length,
      captured_amount_paise: '0',
      in_settlement_count: 0,
      in_settlement_amount_paise: '0',
      sent_to_bank_count: 0,
      sent_to_bank_amount_paise: '0',
      credited_count: 0,
      credited_amount_paise: '0',
      unsettled_count: 0,
      unsettled_amount_paise: '0'
    };
    
    // Calculate aggregates
    let totalAmount = 0;
    const amounts = {
      IN_SETTLEMENT: 0,
      SENT_TO_BANK: 0,
      CREDITED: 0,
      UNSETTLED: 0
    };
    
    for (const txn of filtered) {
      totalAmount += txn.amount_paise;
      amounts[txn.state] += txn.amount_paise;
      
      switch (txn.state) {
        case 'IN_SETTLEMENT':
          result.in_settlement_count++;
          break;
        case 'SENT_TO_BANK':
          result.sent_to_bank_count++;
          break;
        case 'CREDITED':
          result.credited_count++;
          break;
        case 'UNSETTLED':
          result.unsettled_count++;
          break;
      }
    }
    
    // Convert amounts to strings (to match PostgreSQL BIGINT behavior)
    result.captured_amount_paise = totalAmount.toString();
    result.in_settlement_amount_paise = amounts.IN_SETTLEMENT.toString();
    result.sent_to_bank_amount_paise = amounts.SENT_TO_BANK.toString();
    result.credited_amount_paise = amounts.CREDITED.toString();
    result.unsettled_amount_paise = amounts.UNSETTLED.toString();
    
    return result;
  }
  
  // Get statistics
  async getStats() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const stats = {};
    for (const txn of this.settlements) {
      if (!stats[txn.state]) {
        stats[txn.state] = {
          count: 0,
          total_amount: 0
        };
      }
      stats[txn.state].count++;
      stats[txn.state].total_amount += txn.amount_paise;
    }
    
    return Object.entries(stats).map(([state, data]) => ({
      state,
      count: data.count,
      avg_amount_inr: (data.total_amount / data.count / 100).toFixed(2),
      total_amount_inr: (data.total_amount / 100).toFixed(2)
    }));
  }
}

// Singleton instance
const mockDB = new MockDatabase();

// Export compatible interface
module.exports = {
  query: async (sql, params) => {
    // This is a simplified mock - just initialize on any query
    await mockDB.initialize();
    return { rows: [], rowCount: 0 };
  },
  
  // Custom method for settlement pipeline
  querySettlements: (fromDate, toDate) => mockDB.querySettlements(fromDate, toDate),
  
  // Initialize method
  initializeSettlements: () => mockDB.initialize(),
  
  // Get stats
  getSettlementStats: () => mockDB.getStats()
};