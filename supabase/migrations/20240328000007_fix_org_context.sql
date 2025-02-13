-- Drop existing organization policies
DROP POLICY IF EXISTS "organizations_access" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;

-- Create new organization policies
CREATE POLICY "organizations_access" ON organizations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND (
                -- Super admins can see all organizations
                r.role = 'super_admin'
                -- Others can only see their own organization
                OR r.organization_id = organizations.id
            )
        )
    );

CREATE POLICY "organizations_update" ON organizations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND (
                -- Super admins can update any organization
                r.role = 'super_admin'
                -- Admins can only update their own organization
                OR (r.role = 'admin' AND r.organization_id = organizations.id)
            )
        )
    );

-- Refresh the materialized view to ensure it's up to date
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles; 