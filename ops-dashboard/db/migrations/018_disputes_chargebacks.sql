-- V18: Create Disputes & Chargebacks Management System
-- Based on V1 schema (V14-V16) adapted for V2 architecture

-- Main chargeback/dispute table
CREATE TABLE sp_v2_chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Merchant & Reference
    merchant_id VARCHAR(100) NOT NULL,
    merchant_name VARCHAR(255),
    acquirer TEXT NOT NULL CHECK (acquirer IN ('VISA', 'MASTERCARD', 'RUPAY', 'PAYTM', 'PHONEPE', 'RAZORPAY', 'CASHFREE', 'BANK', 'UPI', 'OTHER')),
    network_case_id TEXT NOT NULL,
    case_ref VARCHAR(100),
    
    -- Transaction correlation
    txn_ref TEXT NOT NULL,
    original_transaction_id VARCHAR(255),
    gateway_txn_id VARCHAR(255),
    utr VARCHAR(255),
    rrn VARCHAR(255),
    
    -- Financial details (all in paise)
    original_gross_paise BIGINT NOT NULL CHECK (original_gross_paise >= 0),
    chargeback_paise BIGINT NOT NULL CHECK (chargeback_paise >= 0),
    fees_paise BIGINT NOT NULL DEFAULT 0 CHECK (fees_paise >= 0),
    recovered_paise BIGINT NOT NULL DEFAULT 0 CHECK (recovered_paise >= 0),
    pending_recovery_paise BIGINT NOT NULL DEFAULT 0 CHECK (pending_recovery_paise >= 0),
    writeoff_paise BIGINT NOT NULL DEFAULT 0 CHECK (writeoff_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    
    -- Dispute details
    reason_code TEXT NOT NULL,
    reason_description TEXT,
    customer_complaint TEXT,
    
    -- Workflow stage
    stage TEXT NOT NULL DEFAULT 'NEW' CHECK (stage IN (
        'NEW',              -- Just received
        'UNDER_REVIEW',     -- Team reviewing
        'REPRESENTMENT',    -- Evidence submitted
        'PRE_ARBIT',        -- Pre-arbitration
        'ARBITRATION',      -- Final arbitration
        'CLOSED'            -- Resolved
    )),
    
    -- Outcome
    outcome TEXT CHECK (outcome IN ('PENDING', 'WON', 'LOST', 'PARTIAL')),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN',             -- Active dispute
        'RECOVERED',        -- Won - money recovered
        'WRITEOFF'          -- Lost - written off
    )),
    
    -- Owner assignment
    assigned_to VARCHAR(100),
    assigned_team VARCHAR(50) CHECK (assigned_team IN ('OPS', 'COMPLIANCE', 'FINANCE', 'MERCHANT_OPS')),
    
    -- Dates & deadlines
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ,
    evidence_due_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Metadata
    source_system VARCHAR(50) DEFAULT 'MANUAL',
    external_reference JSONB,
    notes TEXT,
    tags TEXT[],
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- Constraints
    CONSTRAINT chargeback_acquirer_network_case_unique UNIQUE (acquirer, network_case_id),
    CONSTRAINT chargeback_closed_at_check CHECK (
        (status = 'OPEN' AND closed_at IS NULL) OR
        (status IN ('RECOVERED', 'WRITEOFF') AND closed_at IS NOT NULL)
    ),
    CONSTRAINT chargeback_recovery_balance_check CHECK (
        recovered_paise + pending_recovery_paise + writeoff_paise <= (chargeback_paise + fees_paise)
    )
);

-- Indices for chargebacks
CREATE INDEX idx_sp_v2_chargebacks_merchant ON sp_v2_chargebacks(merchant_id, status);
CREATE INDEX idx_sp_v2_chargebacks_stage ON sp_v2_chargebacks(stage) WHERE stage != 'CLOSED';
CREATE INDEX idx_sp_v2_chargebacks_txn_ref ON sp_v2_chargebacks(txn_ref);
CREATE INDEX idx_sp_v2_chargebacks_utr ON sp_v2_chargebacks(utr) WHERE utr IS NOT NULL;
CREATE INDEX idx_sp_v2_chargebacks_received_at ON sp_v2_chargebacks(received_at DESC);
CREATE INDEX idx_sp_v2_chargebacks_deadline ON sp_v2_chargebacks(deadline_at) WHERE deadline_at IS NOT NULL AND status = 'OPEN';
CREATE INDEX idx_sp_v2_chargebacks_assigned ON sp_v2_chargebacks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_sp_v2_chargebacks_case_ref ON sp_v2_chargebacks(case_ref);

-- Documents & evidence table
CREATE TABLE sp_v2_chargeback_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id) ON DELETE CASCADE,
    
    -- Document details
    kind TEXT NOT NULL CHECK (kind IN ('NOTICE', 'EVIDENCE', 'DECISION', 'CORRESPONDENCE', 'OTHER')),
    file_name TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    
    -- Storage
    s3_bucket VARCHAR(255),
    s3_key TEXT NOT NULL,
    s3_url TEXT,
    
    -- Security
    sha256 TEXT NOT NULL,
    encrypted BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    description TEXT,
    uploaded_by VARCHAR(100),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_chargeback_documents_chargeback ON sp_v2_chargeback_documents(chargeback_id);
CREATE INDEX idx_sp_v2_chargeback_documents_kind ON sp_v2_chargeback_documents(chargeback_id, kind);

-- Recovery actions table
CREATE TABLE sp_v2_recovery_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id) ON DELETE CASCADE,
    
    -- Recovery method
    kind TEXT NOT NULL CHECK (kind IN (
        'RESERVE_DEBIT',           -- Deduct from merchant reserve
        'SETTLEMENT_DEDUCTION',     -- Deduct from future settlements
        'MANUAL_INVOICE',           -- Manual invoice to merchant
        'PAYMENT_LINK',             -- Send payment link
        'WAIVER'                    -- Waived by management
    )),
    
    -- Amount
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
        'QUEUED',       -- Waiting to execute
        'EXECUTED',     -- Successfully executed
        'FAILED',       -- Failed to execute
        'PARTIAL',      -- Partially executed
        'CANCELLED'     -- Cancelled
    )),
    
    -- Execution details
    executed_at TIMESTAMPTZ,
    executed_amount_paise BIGINT DEFAULT 0,
    failure_code TEXT,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Reference
    settlement_batch_id VARCHAR(100),
    reserve_transaction_id UUID,
    invoice_id VARCHAR(100),
    payment_link_id VARCHAR(100),
    
    -- Metadata
    notes TEXT,
    created_by VARCHAR(100),
    executed_by VARCHAR(100),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT recovery_action_execution_check CHECK (
        (status = 'EXECUTED' AND executed_at IS NOT NULL AND executed_amount_paise > 0) OR
        (status = 'FAILED' AND failure_code IS NOT NULL) OR
        (status IN ('QUEUED', 'PARTIAL', 'CANCELLED'))
    )
);

CREATE INDEX idx_sp_v2_recovery_actions_chargeback ON sp_v2_recovery_actions(chargeback_id);
CREATE INDEX idx_sp_v2_recovery_actions_status ON sp_v2_recovery_actions(status) WHERE status IN ('QUEUED', 'PARTIAL');
CREATE INDEX idx_sp_v2_recovery_actions_created ON sp_v2_recovery_actions(created_at DESC);

-- Audit trail table
CREATE TABLE sp_v2_chargeback_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id) ON DELETE CASCADE,
    
    -- Action
    action TEXT NOT NULL CHECK (action IN (
        'CREATE',
        'UPDATE_STAGE',
        'UPDATE_OUTCOME',
        'UPDATE_STATUS',
        'ADD_DOCUMENT',
        'ASSIGN',
        'RECOVER',
        'ADD_NOTE',
        'UPDATE_DEADLINE',
        'CORRELATE_TRANSACTION'
    )),
    
    -- State changes
    before_value JSONB,
    after_value JSONB NOT NULL,
    
    -- Actor
    performed_by VARCHAR(100),
    role TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Context
    reason TEXT,
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_chargeback_audit_chargeback ON sp_v2_chargeback_audit(chargeback_id, created_at DESC);
CREATE INDEX idx_sp_v2_chargeback_audit_action ON sp_v2_chargeback_audit(action, created_at DESC);
CREATE INDEX idx_sp_v2_chargeback_audit_created ON sp_v2_chargeback_audit(created_at DESC);

-- Representment history table
CREATE TABLE sp_v2_chargeback_representments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id) ON DELETE CASCADE,
    
    -- Submission details
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by VARCHAR(100),
    submission_method VARCHAR(50) CHECK (submission_method IN ('API', 'PORTAL', 'EMAIL', 'MANUAL')),
    
    -- Evidence summary
    evidence_summary TEXT,
    evidence_document_count INTEGER DEFAULT 0,
    
    -- Response
    response_received_at TIMESTAMPTZ,
    network_response TEXT,
    response_document_id UUID REFERENCES sp_v2_chargeback_documents(id),
    
    -- Outcome
    outcome TEXT CHECK (outcome IN ('PENDING', 'ACCEPTED', 'REJECTED', 'PARTIAL')),
    outcome_amount_paise BIGINT,
    outcome_reason TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_chargeback_representments_chargeback ON sp_v2_chargeback_representments(chargeback_id);
CREATE INDEX idx_sp_v2_chargeback_representments_outcome ON sp_v2_chargeback_representments(outcome) WHERE outcome = 'PENDING';

-- Transaction correlation table
CREATE TABLE sp_v2_chargeback_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id) ON DELETE CASCADE,
    
    -- Matched entities
    pg_transaction_id VARCHAR(255),
    bank_transaction_id VARCHAR(255),
    settlement_batch_id VARCHAR(100),
    
    -- Correlation method
    correlation_method TEXT NOT NULL CHECK (correlation_method IN (
        'EXACT_TXN_REF',        -- Exact transaction ID match
        'UTR_MATCH',            -- UPI UTR match
        'RRN_MATCH',            -- Card RRN match
        'GATEWAY_ID_MATCH',     -- Gateway transaction ID match
        'FUZZY_AMOUNT_TIME',    -- Amount + time window match
        'MANUAL'                -- Manual correlation
    )),
    
    -- Confidence
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    match_criteria JSONB,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(100),
    verified_at TIMESTAMPTZ,
    
    -- Audit
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_chargeback_correlations_chargeback ON sp_v2_chargeback_correlations(chargeback_id);
CREATE INDEX idx_sp_v2_chargeback_correlations_pg_txn ON sp_v2_chargeback_correlations(pg_transaction_id) WHERE pg_transaction_id IS NOT NULL;
CREATE INDEX idx_sp_v2_chargeback_correlations_bank_txn ON sp_v2_chargeback_correlations(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

-- Settlement deduction tracking
CREATE TABLE sp_v2_settlement_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_action_id UUID NOT NULL REFERENCES sp_v2_recovery_actions(id),
    chargeback_id UUID NOT NULL REFERENCES sp_v2_chargebacks(id),
    
    -- Settlement reference
    settlement_batch_id VARCHAR(100),
    settlement_date DATE,
    merchant_id VARCHAR(100) NOT NULL,
    
    -- Deduction details
    deduction_paise BIGINT NOT NULL CHECK (deduction_paise > 0),
    settlement_gross_paise BIGINT,
    max_deduction_percent DECIMAL(5,2) DEFAULT 30.00,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',      -- Scheduled for deduction
        'APPLIED',      -- Successfully deducted
        'REVERSED',     -- Deduction reversed
        'FAILED'        -- Failed to apply
    )),
    
    -- Execution
    applied_at TIMESTAMPTZ,
    applied_by VARCHAR(100),
    failure_reason TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_v2_settlement_deductions_recovery ON sp_v2_settlement_deductions(recovery_action_id);
CREATE INDEX idx_sp_v2_settlement_deductions_batch ON sp_v2_settlement_deductions(settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;
CREATE INDEX idx_sp_v2_settlement_deductions_merchant ON sp_v2_settlement_deductions(merchant_id, status) WHERE status = 'PENDING';

-- Trigger to update chargeback updated_at
CREATE OR REPLACE FUNCTION update_sp_v2_chargeback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sp_v2_chargeback_updated_at_trigger
    BEFORE UPDATE ON sp_v2_chargebacks
    FOR EACH ROW
    EXECUTE FUNCTION update_sp_v2_chargeback_updated_at();

-- Trigger to update recovery_actions updated_at
CREATE OR REPLACE FUNCTION update_sp_v2_recovery_action_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sp_v2_recovery_action_updated_at_trigger
    BEFORE UPDATE ON sp_v2_recovery_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_sp_v2_recovery_action_updated_at();

-- Comments
COMMENT ON TABLE sp_v2_chargebacks IS 'Main disputes and chargebacks tracking table';
COMMENT ON TABLE sp_v2_chargeback_documents IS 'Evidence and documentation for chargebacks';
COMMENT ON TABLE sp_v2_recovery_actions IS 'Recovery actions and financial recovery tracking';
COMMENT ON TABLE sp_v2_chargeback_audit IS 'Complete audit trail of all chargeback changes';
COMMENT ON TABLE sp_v2_chargeback_representments IS 'Representment submission and response tracking';
COMMENT ON TABLE sp_v2_chargeback_correlations IS 'Transaction correlation and matching records';
COMMENT ON TABLE sp_v2_settlement_deductions IS 'Settlement batch deduction tracking';

COMMENT ON COLUMN sp_v2_chargebacks.case_ref IS 'Human-readable case reference: VISA-2025-042-abc123de';
COMMENT ON COLUMN sp_v2_chargebacks.stage IS 'Workflow stage in dispute lifecycle';
COMMENT ON COLUMN sp_v2_chargebacks.outcome IS 'Final resolution outcome';
COMMENT ON COLUMN sp_v2_chargebacks.status IS 'Financial recovery status';
COMMENT ON COLUMN sp_v2_recovery_actions.kind IS 'Method used for recovering disputed amount';
COMMENT ON COLUMN sp_v2_chargeback_correlations.confidence_score IS 'Match confidence: 1.00 (exact) to 0.70 (fuzzy)';
