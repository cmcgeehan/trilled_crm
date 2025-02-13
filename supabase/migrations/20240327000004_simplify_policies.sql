-- Drop all existing policies
DROP POLICY IF EXISTS "users_access_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "organizations_access_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
DROP POLICY IF EXISTS "companies_access_policy" ON companies;

-- Drop the check_user_access function as it's not needed
DROP FUNCTION IF EXISTS check_user_access(uuid);

-- Simple direct policies for users table
CREATE POLICY "users_select_policy" ON users
    FOR SELECT
    TO authenticated
    USING (
        -- Users can see themselves
        id = auth.uid()
        OR (
            -- Get current user's role and org_id directly
            EXISTS (
                SELECT 1 FROM users current_user
                WHERE current_user.id = auth.uid()
                AND current_user.deleted_at IS NULL
                AND (
                    -- Super admins can see all
                    current_user.role = 'super_admin'
                    -- Others can only see within their org
                    OR (
                        current_user.organization_id = users.organization_id 
                        AND current_user.organization_id IS NOT NULL
                    )
                )
            )
        )
    );

CREATE POLICY "users_update_policy" ON users
    FOR UPDATE
    TO authenticated
    USING (
        -- Users can update themselves
        id = auth.uid()
        OR (
            -- Get current user's role and org_id directly
            EXISTS (
                SELECT 1 FROM users current_user
                WHERE current_user.id = auth.uid()
                AND current_user.deleted_at IS NULL
                AND (
                    -- Super admins can update all
                    current_user.role = 'super_admin'
                    -- Admins can update within their org
                    OR (
                        current_user.role = 'admin'
                        AND current_user.organization_id = users.organization_id 
                        AND current_user.organization_id IS NOT NULL
                    )
                )
            )
        )
    );

-- Simple direct policies for organizations table
CREATE POLICY "organizations_select_policy" ON organizations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users current_user
            WHERE current_user.id = auth.uid()
            AND current_user.deleted_at IS NULL
            AND (
                -- Super admins can see all orgs
                current_user.role = 'super_admin'
                -- Users can see their own org
                OR current_user.organization_id = organizations.id
            )
        )
    );

CREATE POLICY "organizations_update_policy" ON organizations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users current_user
            WHERE current_user.id = auth.uid()
            AND current_user.deleted_at IS NULL
            AND (
                -- Super admins can update all orgs
                current_user.role = 'super_admin'
                -- Admins can update their own org
                OR (
                    current_user.role = 'admin'
                    AND current_user.organization_id = organizations.id
                )
            )
        )
    );

-- Simple direct policy for companies table
CREATE POLICY "companies_select_policy" ON companies
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM users current_user
            WHERE current_user.id = auth.uid()
            AND current_user.deleted_at IS NULL
            AND (
                -- Super admins can see all companies
                current_user.role = 'super_admin'
                -- Users can see companies in their org
                OR current_user.organization_id = companies.organization_id
            )
        )
    );

-- Add policy for creating users (needed for auth flow)
CREATE POLICY "users_insert_policy" ON users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users current_user
            WHERE current_user.id = auth.uid()
            AND current_user.deleted_at IS NULL
            AND (
                current_user.role = 'super_admin'
                OR current_user.role = 'admin'
            )
        )
    ); 