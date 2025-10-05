-- ========================================================================
-- MERCHANT DASHBOARD REPORTS BACKEND SCHEMA
-- SettlePaisa V2.0 - Reports Module Database Schema
-- ========================================================================

-- ========================================================================
-- TABLE: sp_v2_report_metadata
-- Stores metadata for all generated reports (on-demand and scheduled)
-- ========================================================================
CREATE TABLE IF NOT EXISTS sp_v2_report_metadata (
  id                    BIGSERIAL PRIMARY KEY,
  report_id             VARCHAR(50) UNIQUE NOT NULL,
  merchant_id           VARCHAR(50) NOT NULL,
  report_type           VARCHAR(20) NOT NULL CHECK (report_type IN ('TRANSACTION', 'SETTLEMENT', 'DISPUTE', 'TAX', 'INVOICE')),
  report_name           VARCHAR(255) NOT NULL,
  report_description    TEXT,
  date_range_from       DATE NOT NULL,
  date_range_to         DATE NOT NULL,
  format                VARCHAR(10) NOT NULL CHECK (format IN ('CSV', 'XLSX', 'PDF')),
  status                VARCHAR(20) NOT NULL DEFAULT 'GENERATING' CHECK (status IN ('GENERATING', 'READY', 'FAILED', 'EXPIRED')),
  file_size_bytes       BIGINT,
  file_path             TEXT,
  download_url          TEXT,
  row_count             INTEGER DEFAULT 0,
  generated_at          TIMESTAMP DEFAULT NOW(),
  expires_at            TIMESTAMP,
  downloaded_count      INTEGER DEFAULT 0,
  last_downloaded_at    TIMESTAMP,
  error_message         TEXT,
  generation_time_ms    INTEGER,
  created_by            VARCHAR(50),
  metadata              JSONB,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_report_metadata_merchant ON sp_v2_report_metadata(merchant_id);
CREATE INDEX idx_report_metadata_type_status ON sp_v2_report_metadata(report_type, status);
CREATE INDEX idx_report_metadata_generated_at ON sp_v2_report_metadata(generated_at DESC);
CREATE INDEX idx_report_metadata_expires_at ON sp_v2_report_metadata(expires_at) WHERE status = 'READY';

COMMENT ON TABLE sp_v2_report_metadata IS 'Stores metadata for all generated merchant reports';
COMMENT ON COLUMN sp_v2_report_metadata.report_id IS 'Unique identifier for the report (e.g., tr-20250914-001)';
COMMENT ON COLUMN sp_v2_report_metadata.expires_at IS 'Reports expire after 30 days and are auto-deleted';
COMMENT ON COLUMN sp_v2_report_metadata.metadata IS 'Additional report-specific metadata (filters, parameters)';

-- ========================================================================
-- TABLE: sp_v2_scheduled_reports
-- Manages recurring/scheduled reports configuration
-- ========================================================================
CREATE TABLE IF NOT EXISTS sp_v2_scheduled_reports (
  id                    BIGSERIAL PRIMARY KEY,
  schedule_id           VARCHAR(50) UNIQUE NOT NULL,
  merchant_id           VARCHAR(50) NOT NULL,
  report_type           VARCHAR(20) NOT NULL CHECK (report_type IN ('TRANSACTION', 'SETTLEMENT', 'DISPUTE', 'TAX', 'INVOICE')),
  report_name           VARCHAR(255) NOT NULL,
  frequency             VARCHAR(20) NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  schedule_expression   VARCHAR(50),
  time_ist              TIME NOT NULL,
  format                VARCHAR(10) NOT NULL CHECK (format IN ('CSV', 'XLSX', 'PDF')),
  delivery_method       VARCHAR(50) NOT NULL DEFAULT 'EMAIL' CHECK (delivery_method IN ('EMAIL', 'SFTP', 'EMAIL_SFTP')),
  email_recipients      TEXT[],
  sftp_config           JSONB,
  date_range_type       VARCHAR(20) DEFAULT 'PREVIOUS_PERIOD' CHECK (date_range_type IN ('PREVIOUS_PERIOD', 'CUSTOM', 'MTD', 'YTD')),
  filters               JSONB,
  is_active             BOOLEAN DEFAULT TRUE,
  last_run_at           TIMESTAMP,
  last_run_status       VARCHAR(20),
  last_report_id        VARCHAR(50),
  next_run_at           TIMESTAMP,
  run_count             INTEGER DEFAULT 0,
  failure_count         INTEGER DEFAULT 0,
  created_by            VARCHAR(50),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scheduled_reports_merchant ON sp_v2_scheduled_reports(merchant_id);
CREATE INDEX idx_scheduled_reports_active ON sp_v2_scheduled_reports(is_active, next_run_at) WHERE is_active = TRUE;
CREATE INDEX idx_scheduled_reports_type ON sp_v2_scheduled_reports(report_type);

COMMENT ON TABLE sp_v2_scheduled_reports IS 'Configuration for recurring/scheduled merchant reports';
COMMENT ON COLUMN sp_v2_scheduled_reports.schedule_expression IS 'Cron-like expression (e.g., "0 9 * * 1" for Monday 9 AM)';
COMMENT ON COLUMN sp_v2_scheduled_reports.date_range_type IS 'PREVIOUS_PERIOD = Yesterday/Last Week/Last Month based on frequency';

-- ========================================================================
-- TABLE: sp_v2_report_recipients
-- Manages email recipients for report delivery (global + per-report)
-- ========================================================================
CREATE TABLE IF NOT EXISTS sp_v2_report_recipients (
  id                    BIGSERIAL PRIMARY KEY,
  merchant_id           VARCHAR(50) NOT NULL,
  recipient_email       VARCHAR(255) NOT NULL,
  recipient_name        VARCHAR(255),
  recipient_role        VARCHAR(50),
  report_types          VARCHAR(20)[] DEFAULT ARRAY['TRANSACTION', 'SETTLEMENT', 'DISPUTE', 'TAX', 'INVOICE'],
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT uq_merchant_recipient UNIQUE(merchant_id, recipient_email)
);

CREATE INDEX idx_report_recipients_merchant ON sp_v2_report_recipients(merchant_id);
CREATE INDEX idx_report_recipients_active ON sp_v2_report_recipients(merchant_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE sp_v2_report_recipients IS 'Global email recipients configuration for merchant reports';
COMMENT ON COLUMN sp_v2_report_recipients.report_types IS 'Array of report types this recipient should receive';

-- ========================================================================
-- TABLE: sp_v2_disputes (NEW - Required for Dispute Reports)
-- ========================================================================
CREATE TABLE IF NOT EXISTS sp_v2_disputes (
  id                    BIGSERIAL PRIMARY KEY,
  dispute_id            VARCHAR(50) UNIQUE NOT NULL,
  merchant_id           VARCHAR(50) NOT NULL,
  transaction_id        VARCHAR(50) NOT NULL,
  settlement_batch_id   BIGINT,
  dispute_type          VARCHAR(30) NOT NULL CHECK (dispute_type IN ('CHARGEBACK', 'RETRIEVAL_REQUEST', 'PRE_ARBITRATION', 'ARBITRATION')),
  dispute_reason        VARCHAR(100),
  dispute_amount_paise  BIGINT NOT NULL CHECK (dispute_amount_paise > 0),
  dispute_date          TIMESTAMP NOT NULL,
  due_date              TIMESTAMP,
  resolution_date       TIMESTAMP,
  status                VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'MERCHANT_WON', 'MERCHANT_LOST', 'WITHDRAWN', 'EXPIRED')),
  merchant_response     TEXT,
  merchant_evidence     JSONB,
  resolution            VARCHAR(30) CHECK (resolution IN ('WON', 'LOST', 'PARTIAL_REFUND', 'WITHDRAWN')),
  resolution_amount_paise BIGINT,
  card_network          VARCHAR(30),
  arn                   VARCHAR(50),
  case_number           VARCHAR(50),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_disputes_merchant ON sp_v2_disputes(merchant_id);
CREATE INDEX idx_disputes_transaction ON sp_v2_disputes(transaction_id);
CREATE INDEX idx_disputes_status ON sp_v2_disputes(status);
CREATE INDEX idx_disputes_date ON sp_v2_disputes(dispute_date DESC);

COMMENT ON TABLE sp_v2_disputes IS 'Chargeback and dispute management for merchant transactions';
COMMENT ON COLUMN sp_v2_disputes.arn IS 'Acquirer Reference Number from card network';

-- ========================================================================
-- TABLE: sp_v2_report_downloads_log
-- Audit trail for report downloads
-- ========================================================================
CREATE TABLE IF NOT EXISTS sp_v2_report_downloads_log (
  id                    BIGSERIAL PRIMARY KEY,
  report_id             VARCHAR(50) NOT NULL,
  merchant_id           VARCHAR(50) NOT NULL,
  downloaded_by         VARCHAR(50),
  download_ip           VARCHAR(45),
  download_user_agent   TEXT,
  downloaded_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_downloads_log_report ON sp_v2_report_downloads_log(report_id);
CREATE INDEX idx_downloads_log_merchant ON sp_v2_report_downloads_log(merchant_id);

COMMENT ON TABLE sp_v2_report_downloads_log IS 'Audit log for all report downloads';

-- ========================================================================
-- VIEWS: Report Statistics
-- ========================================================================

-- Summary of reports generated per type per merchant
CREATE OR REPLACE VIEW v_report_summary AS
SELECT
  merchant_id,
  report_type,
  COUNT(*) AS total_reports,
  COUNT(*) FILTER (WHERE status = 'READY') AS ready_reports,
  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_reports,
  SUM(downloaded_count) AS total_downloads,
  MAX(generated_at) AS last_generated_at
FROM sp_v2_report_metadata
WHERE generated_at >= NOW() - INTERVAL '90 days'
GROUP BY merchant_id, report_type;

-- Active scheduled reports with next run time
CREATE OR REPLACE VIEW v_scheduled_reports_active AS
SELECT
  sr.schedule_id,
  sr.merchant_id,
  sr.report_name,
  sr.report_type,
  sr.frequency,
  sr.time_ist,
  sr.email_recipients,
  sr.next_run_at,
  sr.last_run_at,
  sr.last_run_status,
  sr.run_count,
  rm.report_name AS last_report_name,
  rm.status AS last_report_status
FROM sp_v2_scheduled_reports sr
LEFT JOIN sp_v2_report_metadata rm ON sr.last_report_id = rm.report_id
WHERE sr.is_active = TRUE
ORDER BY sr.next_run_at ASC;

-- ========================================================================
-- FUNCTIONS: Helper functions for report generation
-- ========================================================================

-- Function to calculate next run time for scheduled reports
CREATE OR REPLACE FUNCTION calculate_next_run_time(
  p_frequency VARCHAR(20),
  p_time_ist TIME,
  p_schedule_expression VARCHAR(50) DEFAULT NULL
) RETURNS TIMESTAMP AS $$
DECLARE
  v_next_run TIMESTAMP;
  v_current_time_ist TIMESTAMP;
BEGIN
  v_current_time_ist := NOW() AT TIME ZONE 'Asia/Kolkata';
  
  CASE p_frequency
    WHEN 'DAILY' THEN
      v_next_run := (CURRENT_DATE + 1) + p_time_ist;
      IF v_current_time_ist < (CURRENT_DATE + p_time_ist) THEN
        v_next_run := CURRENT_DATE + p_time_ist;
      END IF;
    
    WHEN 'WEEKLY' THEN
      -- Next Monday at specified time
      v_next_run := DATE_TRUNC('week', CURRENT_DATE + 7) + p_time_ist;
    
    WHEN 'MONTHLY' THEN
      -- 1st of next month at specified time
      v_next_run := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month') + p_time_ist;
    
    WHEN 'CUSTOM' THEN
      -- Parse custom cron expression (simplified - just use next day for now)
      v_next_run := (CURRENT_DATE + 1) + p_time_ist;
    
    ELSE
      v_next_run := NULL;
  END CASE;
  
  RETURN v_next_run AT TIME ZONE 'Asia/Kolkata';
END;
$$ LANGUAGE plpgsql;

-- Function to auto-expire old reports
CREATE OR REPLACE FUNCTION expire_old_reports() RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE sp_v2_report_metadata
  SET status = 'EXPIRED',
      updated_at = NOW()
  WHERE status = 'READY'
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- TRIGGERS: Auto-update timestamps
-- ========================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_report_metadata_updated
  BEFORE UPDATE ON sp_v2_report_metadata
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_scheduled_reports_updated
  BEFORE UPDATE ON sp_v2_scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_report_recipients_updated
  BEFORE UPDATE ON sp_v2_report_recipients
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_disputes_updated
  BEFORE UPDATE ON sp_v2_disputes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ========================================================================
-- SAMPLE DATA: Insert demo data for testing
-- ========================================================================

-- Sample report metadata (last 7 days)
INSERT INTO sp_v2_report_metadata (
  report_id, merchant_id, report_type, report_name, report_description,
  date_range_from, date_range_to, format, status, file_size_bytes,
  file_path, row_count, generated_at, expires_at, downloaded_count
) VALUES
('tr-20250914-001', 'MERCH001', 'TRANSACTION', 'Daily Transaction Report', 'All transactions for 14 Sep 2025', '2025-09-14', '2025-09-14', 'CSV', 'READY', 2457600, '/reports/tr-20250914-001.csv', 450, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '28 days', 3),
('tr-20250908-001', 'MERCH001', 'TRANSACTION', 'Weekly Transaction Summary', 'Week 37 (8-14 Sep 2025)', '2025-09-08', '2025-09-14', 'XLSX', 'READY', 6082560, '/reports/tr-20250908-001.xlsx', 3156, NOW() - INTERVAL '1 day', NOW() + INTERVAL '27 days', 5),
('tr-20250914-002', 'MERCH001', 'TRANSACTION', 'Failed Transactions Report', 'Failed and declined transactions', '2025-09-01', '2025-09-14', 'CSV', 'READY', 897024, '/reports/tr-20250914-002.csv', 127, NOW() - INTERVAL '12 hours', NOW() + INTERVAL '28 days', 2),
('st-20250901-001', 'MERCH001', 'SETTLEMENT', 'Settlement Report - Sep 2025', 'Monthly settlement summary', '2025-09-01', '2025-09-14', 'XLSX', 'READY', 1258291, '/reports/st-20250901-001.xlsx', 342, NOW() - INTERVAL '10 hours', NOW() + INTERVAL '28 days', 4),
('st-20250914-001', 'MERCH001', 'SETTLEMENT', 'Instant Settlement Report', 'All instant settlements this month', '2025-09-01', '2025-09-14', 'CSV', 'READY', 471859, '/reports/st-20250914-001.csv', 87, NOW() - INTERVAL '8 hours', NOW() + INTERVAL '28 days', 1),
('st-20250914-002', 'MERCH001', 'SETTLEMENT', 'Settlement Reconciliation', 'Detailed reconciliation report', '2025-09-01', '2025-09-14', 'XLSX', 'GENERATING', NULL, NULL, 0, NOW(), NULL, 0),
('dp-20250914-001', 'MERCH001', 'DISPUTE', 'Chargeback Report', 'All chargebacks and disputes', '2025-08-01', '2025-09-14', 'PDF', 'READY', 335872, '/reports/dp-20250914-001.pdf', 15, NOW() - INTERVAL '9 hours', NOW() + INTERVAL '28 days', 2),
('dp-20250913-001', 'MERCH001', 'DISPUTE', 'Won Disputes Summary', 'Successfully defended disputes', '2025-07-01', '2025-09-13', 'CSV', 'READY', 188416, '/reports/dp-20250913-001.csv', 8, NOW() - INTERVAL '30 hours', NOW() + INTERVAL '27 days', 1),
('tx-20250901-001', 'MERCH001', 'TAX', 'GST Report - Aug 2025', 'GSTR-1 compatible format', '2025-08-01', '2025-08-31', 'XLSX', 'READY', 931840, '/reports/tx-20250901-001.xlsx', 1245, NOW() - INTERVAL '14 days', NOW() + INTERVAL '14 days', 7),
('tx-20250701-001', 'MERCH001', 'TAX', 'TDS Certificate Q2 2025', 'Quarterly TDS certificate', '2025-04-01', '2025-06-30', 'PDF', 'READY', 131072, '/reports/tx-20250701-001.pdf', 0, NOW() - INTERVAL '75 days', NOW() + INTERVAL '-45 days', 12),
('in-20250901-001', 'MERCH001', 'INVOICE', 'Invoice - Sep 2025', 'Monthly service invoice', '2025-09-01', '2025-09-14', 'PDF', 'READY', 99328, '/reports/in-20250901-001.pdf', 0, NOW() - INTERVAL '14 days', NOW() + INTERVAL '14 days', 3),
('in-20250831-001', 'MERCH001', 'INVOICE', 'Credit Note - Aug 2025', 'Refund and adjustment note', '2025-08-01', '2025-08-31', 'PDF', 'READY', 81920, '/reports/in-20250831-001.pdf', 0, NOW() - INTERVAL '14 days', NOW() + INTERVAL '14 days', 1)
ON CONFLICT (report_id) DO NOTHING;

-- Sample scheduled reports
INSERT INTO sp_v2_scheduled_reports (
  schedule_id, merchant_id, report_type, report_name, frequency, 
  schedule_expression, time_ist, format, delivery_method, email_recipients,
  date_range_type, is_active, next_run_at, last_run_at, last_run_status, run_count
) VALUES
('sch-001', 'MERCH001', 'TRANSACTION', 'Daily Transaction Report', 'DAILY', '0 9 * * *', '09:00:00', 'CSV', 'EMAIL', ARRAY['finance@merchant.com', 'ops@merchant.com'], 'PREVIOUS_PERIOD', TRUE, (CURRENT_DATE + 1) + TIME '09:00:00', NOW() - INTERVAL '15 hours', 'SUCCESS', 45),
('sch-002', 'MERCH001', 'SETTLEMENT', 'Weekly Settlement Summary', 'WEEKLY', '0 10 * * 1', '10:00:00', 'XLSX', 'EMAIL_SFTP', ARRAY['accounts@merchant.com'], 'PREVIOUS_PERIOD', TRUE, DATE_TRUNC('week', CURRENT_DATE + 7) + TIME '10:00:00', NOW() - INTERVAL '5 days', 'SUCCESS', 16),
('sch-003', 'MERCH001', 'TAX', 'Monthly GST Report', 'MONTHLY', '0 0 1 * *', '00:00:00', 'PDF', 'EMAIL', ARRAY['tax@merchant.com', 'ca@merchant.com'], 'PREVIOUS_PERIOD', TRUE, DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month'), NOW() - INTERVAL '14 days', 'SUCCESS', 3)
ON CONFLICT (schedule_id) DO NOTHING;

-- Sample report recipients
INSERT INTO sp_v2_report_recipients (
  merchant_id, recipient_email, recipient_name, recipient_role, report_types
) VALUES
('MERCH001', 'finance@merchant.com', 'Finance Team', 'FINANCE', ARRAY['TRANSACTION', 'SETTLEMENT', 'TAX']),
('MERCH001', 'ops@merchant.com', 'Operations Team', 'OPS', ARRAY['TRANSACTION', 'SETTLEMENT']),
('MERCH001', 'accounts@merchant.com', 'Accounts Team', 'ACCOUNTS', ARRAY['SETTLEMENT', 'TAX', 'INVOICE']),
('MERCH001', 'tax@merchant.com', 'Tax Consultant', 'TAX', ARRAY['TAX']),
('MERCH001', 'admin@merchant.com', 'Administrator', 'ADMIN', ARRAY['TRANSACTION', 'SETTLEMENT', 'DISPUTE', 'TAX', 'INVOICE'])
ON CONFLICT (merchant_id, recipient_email) DO NOTHING;

-- Sample disputes
INSERT INTO sp_v2_disputes (
  dispute_id, merchant_id, transaction_id, dispute_type, dispute_reason,
  dispute_amount_paise, dispute_date, status, resolution, card_network
) VALUES
('DIS-001', 'MERCH001', 'TXN_DEMO_001', 'CHARGEBACK', 'Fraud - Card Not Present', 25000000, NOW() - INTERVAL '15 days', 'MERCHANT_LOST', 'LOST', 'VISA'),
('DIS-002', 'MERCH001', 'TXN_DEMO_002', 'CHARGEBACK', 'Product Not Received', 15000000, NOW() - INTERVAL '20 days', 'MERCHANT_WON', 'WON', 'MASTERCARD'),
('DIS-003', 'MERCH001', 'TXN_DEMO_003', 'RETRIEVAL_REQUEST', 'Transaction Inquiry', 35000000, NOW() - INTERVAL '5 days', 'UNDER_REVIEW', NULL, 'VISA'),
('DIS-004', 'MERCH001', 'TXN_DEMO_004', 'CHARGEBACK', 'Cancelled Recurring', 8500000, NOW() - INTERVAL '30 days', 'MERCHANT_WON', 'WON', 'RUPAY')
ON CONFLICT (dispute_id) DO NOTHING;

-- ========================================================================
-- END OF SCHEMA
-- ========================================================================
