-- Migration: Create Recon Rules Tables
-- Purpose: Store reconciliation matching rules and configurations
-- Version: 015
-- Date: 2025-10-04

-- ===== Recon Rules Table =====
CREATE TABLE IF NOT EXISTS sp_v2_recon_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT, -- NULL for global, merchant_id for merchant-specific, acquirer_code for acquirer-specific
  scope_type TEXT DEFAULT 'global', -- 'global', 'merchant', 'acquirer'
  match_chain TEXT[] NOT NULL, -- Ordered array of fields to match: ['UTR', 'amount', 'date']
  status TEXT DEFAULT 'draft', -- 'draft', 'live', 'archived'
  priority INTEGER DEFAULT 0, -- Higher priority rules are evaluated first
  version INTEGER DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_recon_rules_status ON sp_v2_recon_rules(status);
CREATE INDEX IF NOT EXISTS idx_recon_rules_scope ON sp_v2_recon_rules(scope, scope_type);
CREATE INDEX IF NOT EXISTS idx_recon_rules_priority ON sp_v2_recon_rules(priority DESC);

-- ===== Recon Rule Conditions Table =====
-- Store advanced conditions for each rule (optional)
CREATE TABLE IF NOT EXISTS sp_v2_recon_rule_conditions (
  id SERIAL PRIMARY KEY,
  rule_id TEXT REFERENCES sp_v2_recon_rules(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL, -- 'amount_range', 'payment_method', 'time_window', 'custom'
  field_name TEXT NOT NULL,
  operator TEXT NOT NULL, -- 'equals', 'greater_than', 'less_than', 'in_range', 'contains'
  value_json JSONB, -- Flexible storage for condition values
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_rule_conditions_rule ON sp_v2_recon_rule_conditions(rule_id);

-- ===== Insert Default Rules =====
INSERT INTO sp_v2_recon_rules (id, name, description, scope, scope_type, match_chain, status, priority, version, created_by, updated_by)
VALUES 
  (
    'rule-global-utr-first',
    'Default UTR First',
    'Global rule matching by UTR first, then amount and date',
    NULL,
    'global',
    ARRAY['UTR', 'amount', 'date'],
    'live',
    100,
    3,
    'system',
    'system'
  ),
  (
    'rule-merchant-x-strict',
    'High Value Strict (Merchant X)',
    'Strict matching for high-value merchant transactions',
    'merchant-1',
    'merchant',
    ARRAY['UTR', 'amount', 'date', 'RRN'],
    'draft',
    200,
    1,
    'ops@settlepaisa.com',
    'ops@settlepaisa.com'
  ),
  (
    'rule-global-amount-fallback',
    'Amount Fallback',
    'Fallback rule for transactions without UTR',
    NULL,
    'global',
    ARRAY['amount', 'date', 'merchant_id'],
    'live',
    50,
    2,
    'system',
    'system'
  )
ON CONFLICT (id) DO NOTHING;

-- ===== Add Sample Conditions for Merchant X Rule =====
INSERT INTO sp_v2_recon_rule_conditions (rule_id, condition_type, field_name, operator, value_json)
VALUES
  (
    'rule-merchant-x-strict',
    'amount_range',
    'amount_paise',
    'greater_than',
    '{"threshold": 10000000}'::jsonb -- Only for amounts > ₹1,00,000
  ),
  (
    'rule-merchant-x-strict',
    'payment_method',
    'payment_method',
    'equals',
    '{"methods": ["UPI", "CARD"]}'::jsonb
  )
ON CONFLICT DO NOTHING;
