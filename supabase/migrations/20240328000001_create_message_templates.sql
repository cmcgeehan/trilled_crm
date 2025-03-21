-- Create message_templates table
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    deleted_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX message_templates_organization_id_idx ON message_templates(organization_id);
CREATE INDEX message_templates_created_by_idx ON message_templates(created_by);
CREATE INDEX message_templates_created_at_idx ON message_templates(created_at);

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view templates in their organization"
    ON message_templates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = message_templates.organization_id
        )
    );

CREATE POLICY "Users can create templates in their organization"
    ON message_templates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = message_templates.organization_id
        )
    );

CREATE POLICY "Users can update their own templates"
    ON message_templates FOR UPDATE
    USING (
        auth.uid() = created_by
        AND deleted_at IS NULL
    )
    WITH CHECK (
        auth.uid() = created_by
        AND deleted_at IS NULL
    );

CREATE POLICY "Users can delete their own templates"
    ON message_templates FOR DELETE
    USING (
        auth.uid() = created_by
        AND deleted_at IS NULL
    );

-- Create function to handle soft deletes
CREATE OR REPLACE FUNCTION handle_soft_delete_message_templates()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE message_templates
    SET deleted_at = NOW()
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for soft deletes
CREATE TRIGGER soft_delete_message_templates
    BEFORE DELETE ON message_templates
    FOR EACH ROW
    EXECUTE FUNCTION handle_soft_delete_message_templates(); 