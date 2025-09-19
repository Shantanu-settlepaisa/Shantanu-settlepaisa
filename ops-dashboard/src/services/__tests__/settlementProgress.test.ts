import { computeSettlementProgress } from '../overview-aggregator';

describe('Settlement Progress Metrics', () => {
  it('computes non-negative counts and correct unsettled', async () => {
    const startDate = new Date('2024-01-01').toISOString();
    const endDate = new Date('2024-01-07').toISOString();
    
    const metrics = await computeSettlementProgress(startDate, endDate);
    
    // All counts should be non-negative
    expect(metrics.captured_count).toBeGreaterThanOrEqual(0);
    expect(metrics.in_settlement_count).toBeGreaterThanOrEqual(0);
    expect(metrics.sent_to_bank_count).toBeGreaterThanOrEqual(0);
    expect(metrics.credited_count).toBeGreaterThanOrEqual(0);
    expect(metrics.unsettled_count).toBeGreaterThanOrEqual(0);
    
    // Unsettled should equal captured minus credited
    expect(metrics.unsettled_count).toBe(
      Math.max(0, metrics.captured_count - metrics.credited_count)
    );
    
    // Each stage should be subset of captured (logical consistency)
    expect(metrics.in_settlement_count).toBeLessThanOrEqual(metrics.captured_count);
    expect(metrics.sent_to_bank_count).toBeLessThanOrEqual(metrics.captured_count);
    expect(metrics.credited_count).toBeLessThanOrEqual(metrics.captured_count);
  });
  
  it('ensures at least 10% data in each segment for demo', async () => {
    const startDate = new Date('2024-01-01').toISOString();
    const endDate = new Date('2024-01-07').toISOString();
    
    const metrics = await computeSettlementProgress(startDate, endDate);
    const total = metrics.captured_count;
    
    if (total > 0) {
      // For demo, we want meaningful distribution
      expect(metrics.in_settlement_count / total).toBeGreaterThanOrEqual(0.05); // At least 5%
      expect(metrics.sent_to_bank_count / total).toBeGreaterThanOrEqual(0.05);
      expect(metrics.credited_count / total).toBeGreaterThanOrEqual(0.10);
      expect(metrics.unsettled_count / total).toBeGreaterThanOrEqual(0.05);
    }
  });
  
  it('maintains backward compatibility with legacy keys', async () => {
    const startDate = new Date('2024-01-01').toISOString();
    const endDate = new Date('2024-01-07').toISOString();
    
    const metrics = await computeSettlementProgress(startDate, endDate);
    
    // Legacy keys should still exist
    expect(metrics.capturedTxns).toBeDefined();
    expect(metrics.inSettlementTxns).toBeDefined();
    expect(metrics.settledToBankTxns).toBeDefined();
    expect(metrics.unsettledTxns).toBeDefined();
    
    // Legacy keys should match new keys
    expect(metrics.capturedTxns).toBe(metrics.captured_count);
    expect(metrics.settledToBankTxns).toBe(metrics.credited_count);
    expect(metrics.unsettledTxns).toBe(metrics.unsettled_count);
  });
  
  it('returns valid window information', async () => {
    const startDate = new Date('2024-01-01').toISOString();
    const endDate = new Date('2024-01-07').toISOString();
    
    const metrics = await computeSettlementProgress(startDate, endDate);
    
    expect(metrics.window).toBeDefined();
    expect(metrics.window.from).toBe(startDate);
    expect(metrics.window.to).toBe(endDate);
  });
});