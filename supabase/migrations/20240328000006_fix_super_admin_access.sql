-- Drop existing policies
DROP POLICY IF EXISTS "users_self_access" ON users;
DROP POLICY IF EXISTS "users_org_access" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;

-- Create new policies
CREATE POLICY "users_self_access" ON users
    FOR ALL
    TO authenticated
    USING (id = auth.uid());

-- Policy for viewing users - super admins can see all, others see their org
CREATE POLICY "users_org_access" ON users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND (
                -- Super admins can see all users
                r.role = 'super_admin'
                -- Others can only see within their org
                OR (r.organization_id = users.organization_id AND r.organization_id IS NOT NULL)
            )
        )
    );

-- Policy for updating users
CREATE POLICY "users_update" ON users
    FOR UPDATE
    TO authenticated
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND (
                -- Super admins can update any user
                r.role = 'super_admin'
                -- Admins can only update within their org
                OR (
                    r.role = 'admin' 
                    AND r.organization_id = users.organization_id 
                    AND r.organization_id IS NOT NULL
                )
            )
        )
    );

-- Policy for inserting users
CREATE POLICY "users_insert" ON users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Allow users to insert their own record during signup
        id = auth.uid()
        OR
        -- Allow super admins to create users in any org
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.role = 'super_admin'
        )
        OR
        -- Allow admins to create users only in their org
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.role = 'admin'
            AND r.organization_id = users.organization_id
            AND r.organization_id IS NOT NULL
        )
        OR
        -- Allow agents to create leads and customers in their org
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.role = 'agent'
            AND r.organization_id = users.organization_id
            AND r.organization_id IS NOT NULL
            AND users.role IN ('lead', 'customer')
        )
    );

-- Refresh the materialized view to ensure it's up to date
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles; 