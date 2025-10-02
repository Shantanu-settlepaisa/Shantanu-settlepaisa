-- Migration: Create SFTP Bank File Ingestion Tables
-- Author: System
-- Date: 2025-09-19
-- Feature: FEATURE_BANK_SFTP_INGESTION

-- Registry of every remote file seen/processed
CREATE TABLE IF NOT EXISTS ingested_files (
  id               BIGSERIAL PRIMARY KEY,
  bank             TEXT NOT NULL,
  remote_path      TEXT NOT NULL,
  filename         TEXT NOT NULL,
  business_date    DATE NOT NULL,
  sequence         INT,
  size_bytes       BIGINT,
  checksum_sha256  TEXT,
  uploaded_at      TIMESTAMPTZ,          -- remote mtime
  seen_at          TIMESTAMPTZ NOT NULL, -- first seen
  completed_at     TIMESTAMPTZ,          -- passed marker/rename/stability
  downloaded_at    TIMESTAMPTZ,
  validated_at     TIMESTAMPTZ,
  status           TEXT NOT NULL CHECK (status IN ('SEEN','COMPLETE','DOWNLOADED','VALIDATED','FAILED')),
  fail_reason      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank, filename)
);

-- Expected files per window (computed from config or read from manifest)
CREATE TABLE IF NOT EXISTS file_expectations (
  id            BIGSERIAL PRIMARY KEY,
  bank          TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  business_date DATE NOT NULL,
  expected_name TEXT NOT NULL,
  expected_seq  INT,
  required      BOOLEAN DEFAULT TRUE,
  received      BOOLEAN DEFAULT FALSE,
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank, business_date, expected_name)
);

-- Health snapshot for the dashboard
CREATE TABLE IF NOT EXISTS connector_health (
  bank           TEXT PRIMARY KEY,
  last_file_at   TIMESTAMPTZ,
  expected_count INT,
  received_count INT,
  lag_minutes    INT,
  window_status  TEXT CHECK (window_status IN ('HEALTHY','DEGRADED','DOWN','UNKNOWN')),
  message        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bank SFTP configurations
CREATE TABLE IF NOT EXISTS bank_ingest_configs (
  id                BIGSERIAL PRIMARY KEY,
  bank              TEXT NOT NULL UNIQUE,
  sftp_config       JSONB NOT NULL,
  filename_config   JSONB NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  cutoffs           TEXT[] NOT NULL,
  grace_minutes     INT NOT NULL DEFAULT 60,
  completion_config JSONB NOT NULL,
  validation_config JSONB NOT NULL,
  pgp_config        JSONB,
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert history for audit
CREATE TABLE IF NOT EXISTS ingest_alerts (
  id         BIGSERIAL PRIMARY KEY,
  bank       TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('MISSING_FILES','STATUS_DOWN','VALIDATION_FAILED','CHECKSUM_MISMATCH','PGP_FAILED')),
  severity   TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','ERROR','CRITICAL')),
  message    TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ingested_files_bank_date ON ingested_files(bank, business_date);
CREATE INDEX IF NOT EXISTS idx_ingested_files_status ON ingested_files(status);
CREATE INDEX IF NOT EXISTS idx_file_expectations_bank_date ON file_expectations(bank, business_date);
CREATE INDEX IF NOT EXISTS idx_file_expectations_received ON file_expectations(bank, received);
CREATE INDEX IF NOT EXISTS idx_ingest_alerts_bank_created ON ingest_alerts(bank, created_at DESC);

-- Insert default configurations for common banks
INSERT INTO bank_ingest_configs (bank, sftp_config, filename_config, timezone, cutoffs, grace_minutes, completion_config, validation_config, pgp_config) VALUES
('AXIS', 
 '{"host": "sftp.axisbank.com", "port": 22, "user": "svc_axis", "path": "/outbound/settlement"}'::jsonb,
 '{"pattern": "AXIS_SETTLE_%Y-%m-%d_%SEQ.csv", "seq_width": 2}'::jsonb,
 'Asia/Kolkata',
 ARRAY['11:30', '15:30', '20:00'],
 60,
 '{"method": "marker_or_rename", "marker_suffix": ".ok", "temp_suffixes": [".part", ".tmp"], "checksum_suffix": ".sha256", "manifest_pattern": "AXIS_EOD_%Y-%m-%d.manifest"}'::jsonb,
 '{"min_size_bytes": 1024, "header_required": true, "row_count_from": "manifest_or_trailer"}'::jsonb,
 '{"verify": true, "public_key_id": "axis-key-2025"}'::jsonb),

('HDFC',
 '{"host": "sftp.hdfcbank.com", "port": 22, "user": "svc_hdfc", "path": "/data/settlements"}'::jsonb,
 '{"pattern": "HDFC_SETTLEMENT_%Y%m%d_%SEQ.csv", "seq_width": 3}'::jsonb,
 'Asia/Kolkata',
 ARRAY['10:00', '14:00', '18:00', '22:00'],
 45,
 '{"method": "rename", "temp_suffixes": [".tmp", ".partial"], "checksum_suffix": ".md5"}'::jsonb,
 '{"min_size_bytes": 512, "header_required": true, "row_count_from": "trailer"}'::jsonb,
 '{"verify": false}'::jsonb),

('ICICI',
 '{"host": "sftp.icicibank.com", "port": 2222, "user": "settlepaisa", "path": "/settlement/daily"}'::jsonb,
 '{"pattern": "ICICI_%Y%m%d_SETTLE.csv", "seq_width": 0}'::jsonb,
 'Asia/Kolkata', 
 ARRAY['09:30', '21:30'],
 90,
 '{"method": "marker", "marker_suffix": ".complete", "temp_suffixes": [".writing"]}'::jsonb,
 '{"min_size_bytes": 2048, "header_required": false, "row_count_from": "none"}'::jsonb,
 '{"verify": true, "public_key_id": "icici-pgp-2025"}'::jsonb)
ON CONFLICT (bank) DO NOTHING;