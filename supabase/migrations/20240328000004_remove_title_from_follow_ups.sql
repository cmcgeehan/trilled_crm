-- Drop existing policies first
DROP POLICY IF EXISTS "follow_ups_insert" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_select" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_update" ON follow_ups;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Organization based follow_ups access" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_v2" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_select_v2" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_update_v2" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_v3" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_select_v3" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_update_v3" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_v4" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_select_v4" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_update_v4" ON follow_ups;

-- Remove title column from follow_ups table
ALTER TABLE follow_ups DROP COLUMN IF EXISTS title;

-- Drop the index if it exists
DROP INDEX IF EXISTS follow_ups_title_idx;

-- Create a simple policy that allows admins to insert follow-ups
CREATE POLICY "follow_ups_insert_v5" ON follow_ups
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND auth_user.deleted_at IS NULL
            AND auth_user.role IN ('admin', 'super_admin')
        )
    );

-- Create a simple policy that allows admins to select follow-ups
CREATE POLICY "follow_ups_select_v5" ON follow_ups
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND auth_user.deleted_at IS NULL
            AND auth_user.role IN ('admin', 'super_admin')
        )
    );

-- Create a simple policy that allows admins to update follow-ups
CREATE POLICY "follow_ups_update_v5" ON follow_ups
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND auth_user.deleted_at IS NULL
            AND auth_user.role IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND auth_user.deleted_at IS NULL
            AND auth_user.role IN ('admin', 'super_admin')
        )
    ); 