-- Create enum for communication direction
CREATE TYPE communication_direction AS ENUM ('outbound', 'inbound', 'internal');

-- Create communications table
CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    direction communication_direction NOT NULL,
    to_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    agent_id UUID NOT NULL REFERENCES auth.users(id),
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX communications_user_id_idx ON communications(user_id);
CREATE INDEX communications_agent_id_idx ON communications(agent_id);
CREATE INDEX communications_direction_idx ON communications(direction);
CREATE INDEX communications_created_at_idx ON communications(created_at);

-- Enable RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Agents can view communications they're involved with"
    ON communications FOR SELECT
    USING (
        auth.uid() = agent_id OR
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('admin', 'super_admin') 
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Agents can create communications"
    ON communications FOR INSERT
    WITH CHECK (
        auth.uid() = agent_id AND
        EXISTS (
            SELECT 1 FROM users
            WHERE id = user_id
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Agents can update their own communications"
    ON communications FOR UPDATE
    USING (auth.uid() = agent_id)
    WITH CHECK (auth.uid() = agent_id);

-- Create function to handle soft deletes
CREATE OR REPLACE FUNCTION handle_soft_delete_communications()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE communications
    SET deleted_at = NOW()
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for soft deletes
CREATE TRIGGER soft_delete_communications
    BEFORE DELETE ON communications
    FOR EACH ROW
    EXECUTE FUNCTION handle_soft_delete_communications(); 