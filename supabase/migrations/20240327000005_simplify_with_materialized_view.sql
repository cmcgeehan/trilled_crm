-- Drop all existing policies for all tables
DROP POLICY IF EXISTS "Agents can create communications" ON communications;
DROP POLICY IF EXISTS "Agents can update their own communications" ON communications;
DROP POLICY IF EXISTS "Organization based communications access" ON communications;
DROP POLICY IF EXISTS "communications_select" ON communications;
DROP POLICY IF EXISTS "communications_insert" ON communications;
DROP POLICY IF EXISTS "communications_update" ON communications;

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Organization based follow_ups access" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_select" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert" ON follow_ups;
DROP POLICY IF EXISTS "follow_ups_update" ON follow_ups;

DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_self_access" ON users;
DROP POLICY IF EXISTS "users_org_access" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;

DROP POLICY IF EXISTS "organizations_select_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_access" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;

DROP POLICY IF EXISTS "companies_select_policy" ON companies;
DROP POLICY IF EXISTS "companies_access" ON companies;

-- Drop auth_roles related function and its dependencies
DROP FUNCTION IF EXISTS sync_auth_roles() CASCADE;

-- First drop the existing materialized view and related objects if they exist
DROP TRIGGER IF EXISTS refresh_user_roles_trigger ON users;
DROP FUNCTION IF EXISTS refresh_user_roles();
DROP MATERIALIZED VIEW IF EXISTS user_roles CASCADE;

-- First drop all existing policies
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_self_access" ON users;
DROP POLICY IF EXISTS "users_org_access" ON users;
DROP POLICY IF EXISTS "organizations_select_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
DROP POLICY IF EXISTS "companies_select_policy" ON companies;

-- Create a materialized view for user roles that will be used in policies
CREATE MATERIALIZED VIEW user_roles AS
SELECT 
    id,
    role,
    organization_id,
    deleted_at
FROM users;

-- Create index for performance
CREATE UNIQUE INDEX user_roles_id_idx ON user_roles(id);
CREATE INDEX user_roles_role_idx ON user_roles(role);
CREATE INDEX user_roles_org_id_idx ON user_roles(organization_id);

-- Grant access to the materialized view
GRANT SELECT ON user_roles TO authenticated;
ALTER MATERIALIZED VIEW user_roles OWNER TO postgres;

-- Create function to refresh the materialized view with elevated privileges
CREATE OR REPLACE FUNCTION refresh_user_roles()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    -- Try to refresh concurrently, if it fails (due to concurrent usage), do nothing
    -- The view will be refreshed by the next trigger event
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't fail the transaction
        RAISE NOTICE 'Could not refresh user_roles view: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

-- Set the owner of the refresh function to postgres
ALTER FUNCTION refresh_user_roles() OWNER TO postgres;

-- Create trigger to refresh the view when users table changes
CREATE TRIGGER refresh_user_roles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_user_roles();

-- Simple policy for users to always see themselves
CREATE POLICY "users_self_access" ON users
    FOR ALL
    TO authenticated
    USING (id = auth.uid());

-- Policy for organization and role-based access
CREATE POLICY "users_org_access" ON users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = users.organization_id
            AND r.organization_id IS NOT NULL
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
            AND r.organization_id = users.organization_id
            AND r.organization_id IS NOT NULL
            AND (r.role = 'super_admin' OR r.role = 'admin')
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
        -- Allow admins and super admins to create users
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id IS NOT NULL
            AND (r.role = 'super_admin' OR r.role = 'admin')
        )
    );

-- Policy for organizations
CREATE POLICY "organizations_access" ON organizations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = organizations.id
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
            AND r.organization_id = organizations.id
            AND (r.role = 'super_admin' OR r.role = 'admin')
        )
    );

-- Policy for companies
CREATE POLICY "companies_access" ON companies
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = companies.organization_id
            AND r.organization_id IS NOT NULL
        )
    );

-- Policies for communications
CREATE POLICY "communications_select" ON communications
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND (
                r.organization_id = (
                    SELECT organization_id
                    FROM users target_user
                    WHERE target_user.id = communications.user_id
                    AND target_user.deleted_at IS NULL
                )
                OR auth.uid() = communications.agent_id
            )
        )
    );

CREATE POLICY "communications_insert" ON communications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = agent_id
        OR EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id IS NOT NULL
            AND (r.role = 'admin' OR r.role = 'super_admin')
        )
    );

CREATE POLICY "communications_update" ON communications
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = agent_id)
    WITH CHECK (auth.uid() = agent_id);

-- Policies for follow_ups
CREATE POLICY "follow_ups_select" ON follow_ups
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.id = auth.uid()
            AND r.deleted_at IS NULL
            AND r.organization_id = (
                SELECT organization_id
                FROM users target_user
                WHERE target_user.id = follow_ups.user_id
                AND target_user.deleted_at IS NULL
            )
        )
    );

CREATE POLICY "follow_ups_insert" ON follow_ups
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = follow_ups.user_id
            AND users.deleted_at IS NULL
            AND (
                users.owner_id::text = auth.uid()::text
                OR users.id::text = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM user_roles r
                    WHERE r.id = auth.uid()
                    AND r.deleted_at IS NULL
                    AND r.organization_id = users.organization_id
                    AND (r.role = 'admin' OR r.role = 'super_admin')
                )
                OR users.created_at >= now() - interval '1 minute'
            )
        )
    );

CREATE POLICY "follow_ups_update" ON follow_ups
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = follow_ups.user_id
            AND users.deleted_at IS NULL
            AND (
                users.owner_id::text = auth.uid()::text
                OR users.id::text = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM user_roles r
                    WHERE r.id = auth.uid()
                    AND r.deleted_at IS NULL
                    AND r.organization_id = users.organization_id
                    AND (r.role = 'admin' OR r.role = 'super_admin')
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = follow_ups.user_id
            AND users.deleted_at IS NULL
            AND (
                users.owner_id::text = auth.uid()::text
                OR users.id::text = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM user_roles r
                    WHERE r.id = auth.uid()
                    AND r.deleted_at IS NULL
                    AND r.organization_id = users.organization_id
                    AND (r.role = 'admin' OR r.role = 'super_admin')
                )
            )
        )
    );

-- Initial refresh of the materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles; 