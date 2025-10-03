CREATE TABLE IF NOT EXISTS sp_v2_connectors (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    connector_type VARCHAR(50) NOT NULL CHECK (connector_type IN ('BANK_SFTP', 'BANK_API', 'PG_API', 'PG_DATABASE')),
    source_entity VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'FAILED', 'TESTING')),
    
    connection_config JSONB NOT NULL,
    
    schedule_enabled BOOLEAN DEFAULT TRUE,
    schedule_cron VARCHAR(100),
    schedule_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20) CHECK (last_run_status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'RUNNING')),
    last_run_details JSONB,
    
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    total_runs INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    
    CONSTRAINT unique_connector_name UNIQUE(name)
);

CREATE INDEX idx_connectors_type ON sp_v2_connectors(connector_type);
CREATE INDEX idx_connectors_status ON sp_v2_connectors(status);
CREATE INDEX idx_connectors_last_run ON sp_v2_connectors(last_run_at DESC);

CREATE TABLE IF NOT EXISTS sp_v2_connector_runs (
    id BIGSERIAL PRIMARY KEY,
    connector_id BIGINT NOT NULL REFERENCES sp_v2_connectors(id) ON DELETE CASCADE,
    
    run_type VARCHAR(50) NOT NULL CHECK (run_type IN ('SCHEDULED', 'MANUAL', 'TEST', 'BACKFILL')),
    run_date DATE,
    
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'RUNNING')),
    
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    
    duration_seconds NUMERIC(10, 2),
    
    error_message TEXT,
    details JSONB,
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    triggered_by VARCHAR(100)
);

CREATE INDEX idx_connector_runs_connector_id ON sp_v2_connector_runs(connector_id);
CREATE INDEX idx_connector_runs_status ON sp_v2_connector_runs(status);
CREATE INDEX idx_connector_runs_started_at ON sp_v2_connector_runs(started_at DESC);

INSERT INTO sp_v2_connectors (
    name,
    connector_type,
    source_entity,
    status,
    connection_config,
    schedule_enabled,
    schedule_cron,
    created_by
) VALUES (
    'SabPaisa PG API',
    'PG_API',
    'SABPAISA',
    'ACTIVE',
    '{
        "api_base_url": "https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData",
        "authentication_type": "IP_WHITELIST",
        "merchant_codes": ["ALL"],
        "sync_days_back": 1,
        "auto_retry": true,
        "retry_count": 3
    }'::jsonb,
    true,
    '0 2 * * *',
    'SYSTEM'
) ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE sp_v2_connectors IS 'Stores configuration for all data connectors (SFTP, API, Database)';
COMMENT ON TABLE sp_v2_connector_runs IS 'Audit log for all connector execution runs';
COMMENT ON COLUMN sp_v2_connectors.connection_config IS 'JSON configuration: {host, port, username, path_pattern, api_url, auth, etc}';
COMMENT ON COLUMN sp_v2_connectors.schedule_cron IS 'Cron expression for scheduled runs (e.g., "0 2 * * *" for 2 AM daily)';
