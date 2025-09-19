const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5106;

app.use(cors());
app.use(bodyParser.json());

// Mock data generator for chargebacks
function generateMockChargebacks() {
  const statuses = ['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK', 'WON', 'LOST'];
  const merchants = ['Flipkart', 'Myntra', 'Amazon'];
  const acquirers = ['BOB', 'ICICI', 'HDFC', 'AXIS'];
  
  const chargebacks = [];
  const now = new Date();
  
  // Generate 52 chargebacks with realistic distribution
  for (let i = 0; i < 52; i++) {
    const daysAgo = Math.floor(Math.random() * 45);
    const openedAt = new Date(now);
    openedAt.setDate(openedAt.getDate() - daysAgo);
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const isOpen = ['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK'].includes(status);
    const isClosed = ['WON', 'LOST'].includes(status);
    
    let evidenceDueAt = null;
    if (isOpen) {
      evidenceDueAt = new Date(now);
      // Mix of overdue, today, and upcoming
      if (i % 3 === 0) {
        evidenceDueAt.setDate(evidenceDueAt.getDate() - Math.floor(Math.random() * 5) - 1); // Overdue
      } else if (i % 5 === 0) {
        // Today - no change needed
      } else {
        evidenceDueAt.setDate(evidenceDueAt.getDate() + Math.floor(Math.random() * 4)); // Next 1-3 days
      }
    }
    
    let closedAt = null;
    if (isClosed) {
      closedAt = new Date(openedAt);
      closedAt.setDate(closedAt.getDate() + Math.floor(Math.random() * 21) + 7); // 7-28 days resolution
      if (closedAt > now) closedAt = now;
    }
    
    chargebacks.push({
      id: `cb_${i + 1}`,
      caseRef: `${acquirers[i % 4]}_CB_2025_${String(i + 1).padStart(6, '0')}`,
      merchantId: `merchant_${(i % 3) + 1}`,
      merchantName: merchants[i % 3],
      acquirer: acquirers[i % 4],
      status,
      amount: BigInt(Math.floor(Math.random() * 50000 + 10000) * 100), // 100-500 rupees in paise
      openedAt: openedAt.toISOString(),
      evidenceDueAt: evidenceDueAt ? evidenceDueAt.toISOString() : null,
      closedAt: closedAt ? closedAt.toISOString() : null,
      txnId: `TXN${Date.now()}${i}`,
      reasonCode: ['13.1', '13.3', '4853', 'U002'][i % 4]
    });
  }
  
  return chargebacks;
}

// Store mock data
const mockChargebacks = generateMockChargebacks();

// GET /disputes/kpis - Main KPIs for the current range
app.get('/disputes/kpis', (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  // Filter by date range
  let filtered = mockChargebacks;
  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter(cb => new Date(cb.openedAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(cb => new Date(cb.openedAt) <= toDate);
  }
  if (merchantId) {
    filtered = filtered.filter(cb => cb.merchantId === merchantId);
  }
  if (acquirerId) {
    filtered = filtered.filter(cb => cb.acquirer === acquirerId);
  }
  
  const openStatuses = ['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK'];
  const openCases = filtered.filter(cb => openStatuses.includes(cb.status));
  const evidenceRequired = filtered.filter(cb => cb.status === 'EVIDENCE_REQUIRED');
  const wonCases = filtered.filter(cb => cb.status === 'WON');
  const lostCases = filtered.filter(cb => cb.status === 'LOST');
  const closedCases = [...wonCases, ...lostCases];
  
  // Calculate resolution days
  let totalResolutionDays = 0;
  let resolutionCount = 0;
  closedCases.forEach(cb => {
    if (cb.closedAt && cb.openedAt) {
      const days = Math.floor((new Date(cb.closedAt) - new Date(cb.openedAt)) / (1000 * 60 * 60 * 24));
      totalResolutionDays += days;
      resolutionCount++;
    }
  });
  
  const response = {
    openCount: openCases.length,
    evidenceRequiredCount: evidenceRequired.length,
    disputedPaise: filtered.reduce((sum, cb) => sum + cb.amount, 0n).toString(),
    recoveredPaise: wonCases.reduce((sum, cb) => sum + cb.amount, 0n).toString(),
    writtenOffPaise: lostCases.reduce((sum, cb) => sum + cb.amount, 0n).toString(),
    avgResolutionDays: resolutionCount > 0 ? Math.round(totalResolutionDays / resolutionCount) : 0
  };
  
  console.log('[Disputes KPIs]', response);
  res.json(response);
});

// GET /disputes/outcome - Windowed outcome stats
app.get('/disputes/outcome', (req, res) => {
  const { window = '7d', merchantId, acquirerId } = req.query;
  
  const days = window === '7d' ? 7 : 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  let filtered = mockChargebacks.filter(cb => 
    ['WON', 'LOST'].includes(cb.status) && 
    cb.closedAt && 
    new Date(cb.closedAt) >= cutoffDate
  );
  
  if (merchantId) {
    filtered = filtered.filter(cb => cb.merchantId === merchantId);
  }
  if (acquirerId) {
    filtered = filtered.filter(cb => cb.acquirer === acquirerId);
  }
  
  const wonCount = filtered.filter(cb => cb.status === 'WON').length;
  const lostCount = filtered.filter(cb => cb.status === 'LOST').length;
  const total = wonCount + lostCount;
  
  // Calculate avg resolution
  let totalDays = 0;
  let count = 0;
  filtered.forEach(cb => {
    if (cb.closedAt && cb.openedAt) {
      const days = Math.floor((new Date(cb.closedAt) - new Date(cb.openedAt)) / (1000 * 60 * 60 * 24));
      totalDays += days;
      count++;
    }
  });
  
  const response = {
    window,
    wonCount,
    lostCount,
    winRatePct: total > 0 ? parseFloat(((wonCount / total) * 100).toFixed(1)) : 0,
    avgResolutionDays: count > 0 ? Math.round(totalDays / count) : 0
  };
  
  console.log('[Disputes Outcome]', response);
  res.json(response);
});

// GET /disputes/sla-buckets - SLA categorization
app.get('/disputes/sla-buckets', (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  const openStatuses = ['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK'];
  let filtered = mockChargebacks.filter(cb => 
    openStatuses.includes(cb.status) && cb.evidenceDueAt
  );
  
  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter(cb => new Date(cb.openedAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(cb => new Date(cb.openedAt) <= toDate);
  }
  if (merchantId) {
    filtered = filtered.filter(cb => cb.merchantId === merchantId);
  }
  if (acquirerId) {
    filtered = filtered.filter(cb => cb.acquirer === acquirerId);
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  
  const overdue = filtered.filter(cb => {
    const due = new Date(cb.evidenceDueAt);
    return due < today;
  });
  
  const dueToday = filtered.filter(cb => {
    const due = new Date(cb.evidenceDueAt);
    return due >= today && due < tomorrow;
  });
  
  const twoToThree = filtered.filter(cb => {
    const due = new Date(cb.evidenceDueAt);
    return due >= tomorrow && due <= threeDaysFromNow;
  });
  
  const response = {
    overdue: {
      count: overdue.length,
      amountPaise: overdue.reduce((sum, cb) => sum + cb.amount, 0n).toString()
    },
    today: {
      count: dueToday.length,
      amountPaise: dueToday.reduce((sum, cb) => sum + cb.amount, 0n).toString()
    },
    twoToThree: {
      count: twoToThree.length,
      amountPaise: twoToThree.reduce((sum, cb) => sum + cb.amount, 0n).toString()
    }
  };
  
  console.log('[Disputes SLA Buckets]', response);
  res.json(response);
});

// Start server
app.listen(PORT, () => {
  console.log(`[Chargeback API] Server running on port ${PORT}`);
  console.log(`- GET http://localhost:${PORT}/disputes/kpis`);
  console.log(`- GET http://localhost:${PORT}/disputes/outcome`);
  console.log(`- GET http://localhost:${PORT}/disputes/sla-buckets`);
});