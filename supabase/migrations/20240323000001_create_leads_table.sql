-- Create leads table
CREATE TYPE lead_status AS ENUM ('new', 'needs_action', 'follow_up', 'awaiting_response', 'closed_won', 'closed_lost');

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status lead_status NOT NULL DEFAULT 'new',
    priority INTEGER NOT NULL DEFAULT 0,
    assigned_to UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Add RLS policies
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leads assigned to them"
    ON leads
    FOR SELECT
    TO authenticated
    USING (
        assigned_to = auth.uid()
        AND deleted_at IS NULL
    );

CREATE POLICY "Users can update leads assigned to them"
    ON leads
    FOR UPDATE
    TO authenticated
    USING (
        assigned_to = auth.uid()
        AND deleted_at IS NULL
    )
    WITH CHECK (
        assigned_to = auth.uid()
        AND deleted_at IS NULL
    );

-- Add updated_at trigger
CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create metrics view
CREATE OR REPLACE VIEW lead_metrics AS
SELECT 
    assigned_to,
    COUNT(CASE WHEN status = 'needs_action' THEN 1 END) as needs_action_count,
    AVG(CASE 
        WHEN closed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (closed_at - created_at))/86400.0 
    END) as avg_days_to_close,
    ROUND(
        COUNT(CASE WHEN status = 'closed_won' THEN 1 END)::NUMERIC / 
        NULLIF(COUNT(CASE WHEN status IN ('closed_won', 'closed_lost') THEN 1 END), 0) * 100,
        1
    ) as conversion_rate
FROM leads
WHERE deleted_at IS NULL
    AND created_at > now() - INTERVAL '7 days'
GROUP BY assigned_to;

-- Add RLS to metrics view
ALTER VIEW lead_metrics OWNER TO authenticated;
GRANT SELECT ON lead_metrics TO authenticated;

CREATE POLICY "Users can view their own metrics"
    ON lead_metrics
    FOR SELECT
    TO authenticated
    USING (
        assigned_to = auth.uid()
    ); 