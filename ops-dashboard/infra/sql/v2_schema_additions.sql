-- Additional V2 schema tables for merchant dashboard

-- Settlement Timeline Events Table
CREATE TABLE IF NOT EXISTS sp_v2_settlement_timeline_events (
    id SERIAL PRIMARY KEY,
    settlement_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    detail TEXT,
    reason VARCHAR(100),
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_settlement_timeline_settlement_id ON sp_v2_settlement_timeline_events(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_timeline_occurred_at ON sp_v2_settlement_timeline_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_settlement_timeline_event_type ON sp_v2_settlement_timeline_events(event_type);

-- Add missing columns to existing tables if they don't exist
DO $$ 
BEGIN
    -- Check if settlement_timeline_events is missing and log
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sp_v2_settlement_timeline_events') THEN
        RAISE NOTICE 'Settlement timeline events table created successfully';
    ELSE
        RAISE NOTICE 'Settlement timeline events table already exists';
    END IF;
END $$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to timeline events
DROP TRIGGER IF EXISTS update_settlement_timeline_events_updated_at ON sp_v2_settlement_timeline_events;
CREATE TRIGGER update_settlement_timeline_events_updated_at 
    BEFORE UPDATE ON sp_v2_settlement_timeline_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();