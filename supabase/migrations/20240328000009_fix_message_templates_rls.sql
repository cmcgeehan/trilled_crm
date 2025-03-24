-- Drop existing policies
DROP POLICY IF EXISTS "Users can update their own templates" ON message_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON message_templates;

-- Create new update policy that allows updating deleted_at
CREATE POLICY "Users can update their own templates"
    ON message_templates FOR UPDATE
    USING (
        auth.uid() = created_by
        AND deleted_at IS NULL
    )
    WITH CHECK (
        auth.uid() = created_by
        AND (
            -- Allow updating deleted_at field
            (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
            -- Or allow updating other fields when not deleted
            OR (NEW.deleted_at IS NULL)
        )
    );

-- Create new delete policy that allows soft deletes
CREATE POLICY "Users can delete their own templates"
    ON message_templates FOR DELETE
    USING (
        auth.uid() = created_by
        AND deleted_at IS NULL
    ); 