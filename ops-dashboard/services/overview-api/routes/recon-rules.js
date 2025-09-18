const express = require('express');
const router = express.Router();

// Feature flag check middleware
const checkFeatureFlag = (req, res, next) => {
  const FEATURE_RECON_RULE_SETTINGS = process.env.FEATURE_RECON_RULE_SETTINGS === 'true' || true; // Default false in production
  if (!FEATURE_RECON_RULE_SETTINGS) {
    return res.status(403).json({ error: 'Feature not enabled' });
  }
  next();
};

// Admin role check middleware
const checkAdminRole = (req, res, next) => {
  // In production, get user from auth context
  const userRole = req.headers['x-user-role'] || 'admin'; // Mock for demo
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized: Admin role required' });
  }
  next();
};

// In-memory storage for demo (replace with database in production)
let rulesStore = new Map();
let idCounter = 3;

// Initialize with seed data
function initializeSeedData() {
  rulesStore.set('rule-001', {
    id: 'rule-001',
    name: 'Default UTR First',
    scope: null,
    match_chain: ['UTR', 'TXNID_AMOUNT_±100', 'RRN_DATE_±1d'],
    tolerances: { amount_paise: 100, date_days: 1 },
    exceptions: [],
    dedupe: null,
    auto_actions: [],
    status: 'live',
    version: 3,
    updatedAt: '2025-09-15T10:00:00Z',
    updatedBy: 'admin@settlepaisa.com'
  });
  
  rulesStore.set('rule-002', {
    id: 'rule-002',
    name: 'High Value Strict (Merchant X)',
    scope: { merchantId: 'MERCH001' },
    match_chain: ['UTR', 'TXNID', 'AMOUNT_EXACT'],
    tolerances: { amount_paise: 0, amount_pct: 0, date_days: 0 },
    exceptions: [
      { when: 'AMOUNT_MISMATCH', reason: 'Amount difference detected', severity: 'HIGH' }
    ],
    dedupe: { key: 'UTR', window_hours: 24, strategy: 'first-write-wins' },
    auto_actions: [],
    status: 'draft',
    version: 1,
    updatedAt: '2025-09-18T08:30:00Z',
    updatedBy: 'ops@settlepaisa.com'
  });
}

initializeSeedData();

// Validate rule structure
function validateRule(rule) {
  const errors = [];
  
  if (!rule.name || rule.name.trim() === '') {
    errors.push('Name is required');
  }
  
  if (!rule.match_chain || !Array.isArray(rule.match_chain) || rule.match_chain.length === 0) {
    errors.push('Match chain must be non-empty array');
  }
  
  if (rule.tolerances) {
    if (rule.tolerances.amount_pct && rule.tolerances.amount_pct > 10) {
      errors.push('Amount percentage tolerance cannot exceed 10%');
    }
    if (rule.tolerances.date_days && rule.tolerances.date_days > 7) {
      errors.push('Date tolerance cannot exceed 7 days');
    }
  }
  
  if (rule.dedupe && rule.dedupe.window_hours > 168) {
    errors.push('Dedup window cannot exceed 168 hours (7 days)');
  }
  
  return errors;
}

// GET /api/recon-rules/rules - List rules with filters
router.get('/rules', checkFeatureFlag, checkAdminRole, (req, res) => {
  const { scope, status, q, page = 1, pageSize = 10 } = req.query;
  
  let rules = Array.from(rulesStore.values());
  
  // Filter by scope
  if (scope && scope !== 'all') {
    rules = rules.filter(r => {
      if (scope === 'global') return r.scope === null;
      if (scope === 'merchant') return r.scope?.merchantId;
      if (scope === 'acquirer') return r.scope?.acquirer;
      if (scope === 'mode') return r.scope?.mode;
      return true;
    });
  }
  
  // Filter by status
  if (status && status !== 'all') {
    rules = rules.filter(r => r.status === status);
  }
  
  // Search
  if (q) {
    const query = q.toLowerCase();
    rules = rules.filter(r => 
      r.name.toLowerCase().includes(query) ||
      r.match_chain.some(c => c.toLowerCase().includes(query))
    );
  }
  
  // Sort by updated date
  rules.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  
  // Paginate
  const start = (page - 1) * pageSize;
  const paginatedRules = rules.slice(start, start + pageSize);
  
  res.json({
    rules: paginatedRules,
    total: rules.length,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// GET /api/recon-rules/rules/:id - Get single rule
router.get('/rules/:id', checkFeatureFlag, checkAdminRole, (req, res) => {
  const rule = rulesStore.get(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  res.json(rule);
});

// POST /api/recon-rules/rules - Create new rule
router.post('/rules', checkFeatureFlag, checkAdminRole, (req, res) => {
  const rule = req.body;
  
  // Validate
  const errors = validateRule(rule);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  // Create new rule
  const newRule = {
    ...rule,
    id: `rule-${String(idCounter++).padStart(3, '0')}`,
    status: rule.status || 'draft',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: rule.updatedBy || 'current-user@settlepaisa.com'
  };
  
  rulesStore.set(newRule.id, newRule);
  res.status(201).json(newRule);
});

// PUT /api/recon-rules/rules/:id - Update existing rule
router.put('/rules/:id', checkFeatureFlag, checkAdminRole, (req, res) => {
  const existingRule = rulesStore.get(req.params.id);
  if (!existingRule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  
  const updates = req.body;
  
  // Merge updates
  const updatedRule = {
    ...existingRule,
    ...updates,
    id: existingRule.id, // Preserve ID
    version: existingRule.version + 1, // Increment version
    updatedAt: new Date().toISOString(),
    updatedBy: updates.updatedBy || 'current-user@settlepaisa.com'
  };
  
  // Validate
  const errors = validateRule(updatedRule);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  rulesStore.set(req.params.id, updatedRule);
  res.json(updatedRule);
});

// POST /api/recon-rules/rules/:id/duplicate - Duplicate rule
router.post('/rules/:id/duplicate', checkFeatureFlag, checkAdminRole, (req, res) => {
  const sourceRule = rulesStore.get(req.params.id);
  if (!sourceRule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  
  const duplicatedRule = {
    ...sourceRule,
    id: `rule-${String(idCounter++).padStart(3, '0')}`,
    name: `${sourceRule.name} (Copy)`,
    status: 'draft',
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'current-user@settlepaisa.com'
  };
  
  rulesStore.set(duplicatedRule.id, duplicatedRule);
  res.json(duplicatedRule);
});

// POST /api/recon-rules/rules/:id/simulate - Simulate rule (stub)
router.post('/rules/:id/simulate', checkFeatureFlag, checkAdminRole, (req, res) => {
  const rule = rulesStore.get(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  
  // Return canned simulation result (no actual engine access)
  const simulationResult = {
    window: { from: "2025-09-01", to: "2025-09-07" },
    baseline: {
      matched: 1575,
      unmatched: 675,
      exceptions: 226,
      reconciledPaise: "38900000"
    },
    proposed: {
      matched: 1602,
      unmatched: 648,
      exceptions: 226,
      reconciledPaise: "39750000"
    },
    delta: {
      matched: 27,
      unmatched: -27,
      exceptions: 0,
      reconciledPaise: "850000"
    }
  };
  
  res.json(simulationResult);
});

// POST /api/recon-rules/rules/:id/publish - Publish rule (stub)
router.post('/rules/:id/publish', checkFeatureFlag, checkAdminRole, (req, res) => {
  const rule = rulesStore.get(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  
  const { status } = req.body;
  if (!['draft', 'canary', 'live', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  // Update status
  rule.status = status;
  rule.updatedAt = new Date().toISOString();
  rulesStore.set(req.params.id, rule);
  
  res.json(rule);
});

module.exports = router;