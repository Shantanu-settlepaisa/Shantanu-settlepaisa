const express = require('express');
const cors = require('cors');
const db = require('./db');
const v2Adapter = require('./db/v2Adapter');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Environment variables
const USE_DB = process.env.USE_DB === 'true';
const MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || '11111111-1111-1111-1111-111111111111';

// Mock merchant settlement schedule data
const mockSettlementSchedule = {
  tPlusDays: 1,
  cutoffMinutesIST: 14 * 60, // 2:00 PM IST
  effectiveFrom: new Date().toISOString().split('T')[0],
  lastChangedAt: new Date().toISOString()
};

// Mock merchant dashboard summary
const mockDashboardSummary = {
  currentBalance: 245000000, // ₹2,45,000 in paise
  nextSettlementDue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  nextSettlementAmount: 87500000, // ₹87,500 in paise
  lastSettlement: {
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    amount: 156300000, // ₹1,56,300 in paise
    status: "COMPLETED"
  },
  awaitingBankFile: false,
  pendingHolds: 0,
  unreconciled: 2500000 // ₹2,500 in paise
};

// Mock settlements list
const mockSettlements = [
  {
    id: "sett_87a408ca-1234-5678-9abc-def123456789",
    type: "regular",
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    amount: 156300000,
    fees: 3126000,
    taxes: 562680,
    netAmount: 152611320,
    status: "COMPLETED",
    utr: "HDFC24091401234567",
    rrn: "RRN24091401234567",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    bankAccount: "HDFC ****1234",
    transactionCount: 450,
    tPlusDays: 1
  },
  {
    id: "sett_inst_1234567890",
    type: "instant", 
    date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    amount: 50000000,
    fees: 600000,
    taxes: 108000,
    netAmount: 49292000,
    status: "COMPLETED",
    utr: "INST24091601234567",
    rrn: "IRRN24091601234567",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
    bankAccount: "HDFC ****1234",
    transactionCount: 1,
    tPlusDays: 0
  },
  {
    id: "sett_e1a5f9cd-2345-6789-abcd-ef1234567890",
    type: "regular", 
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    amount: 234750000,
    fees: 4695000,
    taxes: 845100,
    netAmount: 229209900,
    status: "COMPLETED",
    utr: "ICICI24091301234568",
    rrn: "RRN24091301234568",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
    bankAccount: "ICICI ****5678",
    transactionCount: 523,
    tPlusDays: 1
  },
  {
    id: "sett_f2b6f8de-3456-789a-bcde-f12345678901",
    type: "regular",
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    amount: 98450000,
    fees: 1969000,
    taxes: 354420,
    netAmount: 96126580,
    status: "PROCESSING",
    utr: null,
    rrn: null,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    settledAt: null,
    bankAccount: "SBI ****9012",
    transactionCount: 234,
    tPlusDays: 1
  }
];

// API Routes matching SettlePaisa 2.0 specification
app.get('/health/live', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Merchant settlement schedule APIs
app.get('/merchant/settlement/schedule', async (req, res) => {
  console.log('GET /merchant/settlement/schedule');
  
  try {
    // Try V2 adapter first
    const v2Schedule = await v2Adapter.getSettlementSchedule(MERCHANT_ID);
    
    if (v2Schedule) {
      return res.json(v2Schedule);
    }
    
    // Fallback to mock data
    res.json(mockSettlementSchedule);
  } catch (error) {
    console.error('Get settlement schedule error:', error);
    res.json(mockSettlementSchedule);
  }
});

app.put('/merchant/settlement/schedule', async (req, res) => {
  const { tPlusDays, cutoffMinutesIST, effectiveFrom } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'];
  
  console.log('PUT /merchant/settlement/schedule', { body: req.body, idempotencyKey });
  
  // Validate the request
  if (!tPlusDays || !cutoffMinutesIST) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Try V2 adapter first
    const v2Result = await v2Adapter.updateSettlementSchedule(MERCHANT_ID, {
      tPlusDays,
      cutoffMinutesIST,
      effectiveFrom
    });
    
    if (v2Result) {
      return res.json(v2Result);
    }
    
    // Fallback to mock data update
    mockSettlementSchedule.tPlusDays = tPlusDays;
    mockSettlementSchedule.cutoffMinutesIST = cutoffMinutesIST;
    mockSettlementSchedule.effectiveFrom = effectiveFrom || new Date().toISOString().split('T')[0];
    mockSettlementSchedule.lastChangedAt = new Date().toISOString();
    
    res.json({
      accepted: true,
      appliedFrom: mockSettlementSchedule.effectiveFrom,
      schedule: mockSettlementSchedule
    });
  } catch (error) {
    console.error('Update settlement schedule error:', error);
    res.status(500).json({ error: 'Failed to update settlement schedule' });
  }
});

// Merchant dashboard APIs (matching SP-0010 specification)
app.get('/v1/merchant/dashboard/summary', async (req, res) => {
  console.log('GET /v1/merchant/dashboard/summary');
  
  try {
    // Try V2 adapter first
    const [v2Summary, v2ETA] = await Promise.all([
      v2Adapter.getMerchantSummary(MERCHANT_ID),
      v2Adapter.getNextSettlementETA(MERCHANT_ID)
    ]);
    
    if (v2Summary) {
      // Combine summary with ETA data
      const response = {
        currentBalance: v2Summary.currentBalance,
        nextSettlementDue: v2ETA?.nextSettlementDue || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        nextSettlementAmount: v2Summary.currentBalance, // Current balance is next settlement
        lastSettlement: v2Summary.lastSettlement || {
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          amount: 0,
          status: "PENDING"
        },
        awaitingBankFile: false,
        pendingHolds: v2Summary.holds || 0,
        unreconciled: v2Summary.unreconciled || 0
      };
      
      return res.json(response);
    }
    
    // Fallback to V1 adapter
    const dbData = await db.getDashboardSummary(MERCHANT_ID);
    
    if (dbData) {
      res.json(dbData);
    } else {
      // Fallback to mock data
      res.json(mockDashboardSummary);
    }
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.json(mockDashboardSummary);
  }
});

app.get('/v1/merchant/settlements', async (req, res) => {
  console.log('GET /v1/merchant/settlements', { query: req.query });
  
  try {
    // Support pagination
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    
    // Try V2 adapter first
    const v2Data = await v2Adapter.listSettlements(MERCHANT_ID, { limit, offset });
    
    if (v2Data) {
      return res.json(v2Data);
    }
    
    // Fallback to V1 adapter
    const dbData = await db.listSettlements(MERCHANT_ID, { limit, offset });
    
    if (dbData) {
      res.json(dbData);
    } else {
      // Fallback to mock data
      const paginatedSettlements = mockSettlements.slice(offset, offset + limit);
      
      res.json({
        settlements: paginatedSettlements,
        pagination: {
          limit,
          offset,
          total: mockSettlements.length,
          hasNext: offset + limit < mockSettlements.length
        }
      });
    }
  } catch (error) {
    console.error('List settlements error:', error);
    // Fallback to mock data
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    const paginatedSettlements = mockSettlements.slice(offset, offset + limit);
    
    res.json({
      settlements: paginatedSettlements,
      pagination: {
        limit,
        offset,
        total: mockSettlements.length,
        hasNext: offset + limit < mockSettlements.length
      }
    });
  }
});

// New: On-demand settlements API (must come before :settlementId route)
app.get('/v1/merchant/settlements/on-demand', async (req, res) => {
  console.log('GET /v1/merchant/settlements/on-demand', { query: req.query });
  
  try {
    // Support pagination
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    
    // Try V2 adapter first for on-demand settlements
    const v2Data = await v2Adapter.listOnDemandSettlements(MERCHANT_ID, { limit, offset });
    
    if (v2Data) {
      return res.json(v2Data);
    }
    
    // Fallback to mock on-demand settlements (instant type only)
    const onDemandMockSettlements = mockSettlements.filter(s => s.type === 'instant');
    const paginatedSettlements = onDemandMockSettlements.slice(offset, offset + limit);
    
    res.json({
      settlements: paginatedSettlements,
      pagination: {
        limit,
        offset,
        total: onDemandMockSettlements.length,
        hasNext: offset + limit < onDemandMockSettlements.length
      }
    });
  } catch (error) {
    console.error('List on-demand settlements error:', error);
    // Fallback to mock instant settlements
    const onDemandMockSettlements = mockSettlements.filter(s => s.type === 'instant');
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    const paginatedSettlements = onDemandMockSettlements.slice(offset, offset + limit);
    
    res.json({
      settlements: paginatedSettlements,
      pagination: {
        limit,
        offset,
        total: onDemandMockSettlements.length,
        hasNext: offset + limit < onDemandMockSettlements.length
      }
    });
  }
});

app.get('/v1/merchant/settlements/:settlementId', async (req, res) => {
  const { settlementId } = req.params;
  console.log('GET /v1/merchant/settlements/:id', { settlementId });
  
  try {
    // Try to get data from database if enabled
    const dbData = await db.getSettlementById(settlementId, MERCHANT_ID);
    
    if (dbData) {
      res.json(dbData);
    } else {
      // Fallback to mock data
      const settlement = mockSettlements.find(s => s.id === settlementId);
      
      if (!settlement) {
        return res.status(404).json({ error: 'Settlement not found' });
      }
      
      res.json(settlement);
    }
  } catch (error) {
    console.error('Get settlement error:', error);
    // Fallback to mock data
    const settlement = mockSettlements.find(s => s.id === settlementId);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }
    
    res.json(settlement);
  }
});

// New: Settlement timeline API
app.get('/v1/merchant/settlements/:settlementId/timeline', async (req, res) => {
  const { settlementId } = req.params;
  console.log('GET /v1/merchant/settlements/:id/timeline', { settlementId });
  
  try {
    // Try V2 adapter first
    const v2Timeline = await v2Adapter.getSettlementTimeline(settlementId);
    
    if (v2Timeline) {
      return res.json({ events: v2Timeline });
    }
    
    // Fallback to V1 adapter
    const dbData = await db.listTimelineEvents(settlementId);
    
    if (dbData) {
      res.json({ events: dbData });
    } else {
      // Fallback to mock timeline - check settlement status from request
      const settlementId = req.params.settlementId;
      let mockTimeline = [];
      
      // Check if this is a processing settlement
      const isProcessingSettlement = settlementId.includes('f2b6f8de') || settlementId.includes('2e647b3c');
      
      if (isProcessingSettlement) {
        // For PROCESSING status - stop at BANK_FILE_AWAITED
        mockTimeline = [
          {
            type: 'INITIATED',
            at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
            detail: 'Settlement request initiated'
          },
          {
            type: 'BATCHED',
            at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            detail: 'Added to settlement batch'
          },
          {
            type: 'BANK_FILE_AWAITED',
            reason: 'AWAITING_BANK_FILE',
            at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            detail: 'Awaiting confirmation from the bank',
            meta: {
              expectedByIST: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              bank: 'HDFC Bank'
            }
          }
        ];
      } else {
        // For COMPLETED status - show full timeline
        mockTimeline = [
          {
            type: 'INITIATED',
            at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
            detail: 'Settlement request initiated'
          },
          {
            type: 'BATCHED',
            at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            detail: 'Added to settlement batch'
          },
          {
            type: 'BANK_FILE_RECEIVED',
            at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            detail: 'Bank confirmation file received'
          },
          {
            type: 'UTR_ASSIGNED',
            at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            detail: 'Bank UTR: HDFC24091501234567'
          },
          {
            type: 'SETTLED',
            at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            detail: 'Amount credited to bank account'
          }
        ];
      }
      
      res.json({ events: mockTimeline });
    }
  } catch (error) {
    console.error('Timeline events error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline events' });
  }
});

// New: Settlement transactions with financial breakdown
app.get('/v1/merchant/settlements/:settlementId/transactions', async (req, res) => {
  const { settlementId } = req.params;
  console.log('GET /v1/merchant/settlements/:id/transactions', { settlementId });
  
  try {
    // Try V2 adapter first for real database data
    const v2Transactions = await v2Adapter.getSettlementTransactions(settlementId);
    
    if (v2Transactions) {
      return res.json({ transactions: v2Transactions });
    }
    
    // Fallback to V1 adapter
    const dbData = await db.getSettlementTransactions(settlementId);
    
    if (dbData) {
      res.json({ transactions: dbData });
    } else {
      // Generate realistic transaction data based on V2 schema
      const transactionCount = Math.floor(Math.random() * 20) + 15; // 15-35 transactions
      const transactions = [];
      
      const methods = ['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'NETBANKING'];
      const acquirers = ['HDFC', 'ICICI', 'SBI', 'AXIS'];
      const feeBearers = ['MERCHANT', 'CUSTOMER', 'PLATFORM'];
      
      for (let i = 1; i <= transactionCount; i++) {
        const grossAmount = Math.floor(Math.random() * 50000) + 1000; // ₹10-₹500
        const commissionRate = 2.5 + Math.random() * 1.5; // 2.5-4%
        const commissionAmount = Math.floor(grossAmount * commissionRate / 100);
        const gstAmount = Math.floor(commissionAmount * 0.18); // 18% GST on commission
        const reserveAmount = Math.floor(grossAmount * 0.05); // 5% rolling reserve
        const netAmount = grossAmount - commissionAmount - gstAmount - reserveAmount;
        
        const transactionDate = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
        const settlementDate = new Date(transactionDate.getTime() + (1 + Math.random() * 2) * 24 * 60 * 60 * 1000);
        
        transactions.push({
          transaction_id: `TXN_DEMO_${i.toString().padStart(3, '0')}`,
          amount_paise: grossAmount * 100,
          payment_method: methods[Math.floor(Math.random() * methods.length)],
          status: 'RECONCILED',
          transaction_timestamp: transactionDate.toISOString(),
          settled_at: settlementDate.toISOString(),
          source_type: 'API_SYNC',
          gateway_ref: `GW_${Math.random().toString(36).substring(2, 15)}`,
          utr: `UTR${Math.floor(Math.random() * 1000000000)}`,
          rrn: `RRN${Math.floor(Math.random() * 1000000000)}`,
          acquirer_code: acquirers[Math.floor(Math.random() * acquirers.length)],
          bank_fee_paise: 0, // Included in commission
          settlement_amount_paise: netAmount * 100,
          exception_reason: null,
          // V2 Settlement Items data (financial breakdown)
          commission_paise: commissionAmount * 100,
          gst_paise: gstAmount * 100,
          reserve_paise: reserveAmount * 100,
          net_paise: netAmount * 100,
          fee_bearer: feeBearers[Math.floor(Math.random() * feeBearers.length)],
          commission_type: 'PERCENTAGE',
          commission_rate: commissionRate.toFixed(2)
        });
      }
      
      res.json({ transactions });
    }
  } catch (error) {
    console.error('Settlement transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch settlement transactions' });
  }
});

// New: Instant settlement creation
app.post('/v1/merchant/settlements/instant', async (req, res) => {
  const { amount, bankAccountId } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'];
  
  console.log('POST /v1/merchant/settlements/instant', { body: req.body, idempotencyKey });
  
  // Validate the request
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  try {
    // Try V2 adapter first
    const v2Settlement = await v2Adapter.createInstantSettlement(MERCHANT_ID, { amount, bankAccountId });
    
    if (v2Settlement) {
      return res.json(v2Settlement);
    }
    
    // Fallback to V1 adapter
    const dbData = await db.createInstantSettlement(MERCHANT_ID, { amount, bankAccountId });
    
    if (dbData) {
      res.json(dbData);
    } else {
      // Fallback to mock instant settlement
      const grossPaise = amount * 100;
      const feesPaise = Math.floor(grossPaise * 0.012); // 1.2% instant settlement fee
      const taxesPaise = Math.floor(feesPaise * 0.18); // 18% GST
      const netPaise = grossPaise - feesPaise - taxesPaise;
      
      const instantSettlement = {
        id: 'sett_inst_' + Date.now(),
        type: 'instant',
        amount: netPaise,
        fees: feesPaise,
        tax: taxesPaise,
        grossAmount: grossPaise,
        utr: 'INST' + Date.now().toString().slice(-10),
        status: 'completed',
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString()
      };
      
      res.json(instantSettlement);
    }
  } catch (error) {
    console.error('Create instant settlement error:', error);
    res.status(500).json({ error: 'Failed to create instant settlement' });
  }
});

app.get('/v1/merchant/insights/settlement-trend', async (req, res) => {
  console.log('GET /v1/merchant/insights/settlement-trend', { query: req.query });
  
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Try V2 adapter first
    const v2Data = await v2Adapter.getInsights(MERCHANT_ID, days);
    
    if (v2Data) {
      return res.json(v2Data);
    }
    
    // Fallback to V1 adapter
    const dbData = await db.getSettlementTrend(MERCHANT_ID, days);
    
    if (dbData) {
      res.json({ trend: dbData });
    } else {
      // Fallback to mock trend data
      const trendData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        trendData.push({
          date: date.toISOString().split('T')[0],
          amount: Math.floor(Math.random() * 300000000) + 50000000, // ₹50k-₹350k
          count: Math.floor(Math.random() * 50) + 10,
          fees: Math.floor(Math.random() * 6000000) + 1000000
        });
      }
      
      res.json({ trend: trendData });
    }
  } catch (error) {
    console.error('Settlement trend error:', error);
    // Fallback to mock data
    const trendData = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        amount: Math.floor(Math.random() * 300000000) + 50000000,
        count: Math.floor(Math.random() * 50) + 10,
        fees: Math.floor(Math.random() * 6000000) + 1000000
      });
    }
    
    res.json({ trend: trendData });
  }
});

app.get('/v1/merchant/insights/fees-breakdown', async (req, res) => {
  console.log('GET /v1/merchant/insights/fees-breakdown', { query: req.query });
  
  try {
    // Try to get data from database if enabled
    const dbData = await db.getFeesBreakdown(MERCHANT_ID);
    
    if (dbData) {
      res.json(dbData);
    } else {
      // Fallback to mock data
      res.json({
        breakdown: {
          commission: { rate: 0.021, amount: 15750000 }, // 2.1%, ₹15,750
          gst: { rate: 0.18, amount: 2835000 }, // 18% on commission, ₹2,835  
          tds: { rate: 0.01, amount: 7500000 } // 1%, ₹7,500
        },
        total: 26085000 // ₹26,085
      });
    }
  } catch (error) {
    console.error('Fees breakdown error:', error);
    // Fallback to mock data
    res.json({
      breakdown: {
        commission: { rate: 0.021, amount: 15750000 },
        gst: { rate: 0.18, amount: 2835000 },
        tds: { rate: 0.01, amount: 7500000 }
      },
      total: 26085000
    });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 SettlePaisa Merchant API Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /health/live');
  console.log('  GET  /merchant/settlement/schedule');
  console.log('  PUT  /merchant/settlement/schedule');
  console.log('  GET  /v1/merchant/dashboard/summary');
  console.log('  GET  /v1/merchant/settlements');
  console.log('  GET  /v1/merchant/settlements/:id');
  console.log('  GET  /v1/merchant/settlements/on-demand [NEW]');
  console.log('  GET  /v1/merchant/settlements/:id/timeline [NEW]');
  console.log('  GET  /v1/merchant/settlements/:id/transactions [NEW]');
  console.log('  POST /v1/merchant/settlements/instant [NEW]');
  console.log('  GET  /v1/merchant/insights/settlement-trend');
  console.log('  GET  /v1/merchant/insights/fees-breakdown');
  console.log('');
  console.log(`💾 Database mode: ${USE_DB ? 'ENABLED' : 'DISABLED (using mock data)'}`);
  console.log(`🏪 Default Merchant ID: ${MERCHANT_ID}`);
  console.log('');
  console.log('💡 This server provides realistic settlement data with timeline tracking');
});