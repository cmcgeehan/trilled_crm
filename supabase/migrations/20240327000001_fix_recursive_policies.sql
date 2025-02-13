-- Fix recursive policies for users table
DROP POLICY IF EXISTS "Users can view organization members and super_admins can view all" ON users;
DROP POLICY IF EXISTS "Super admins can update any user" ON users;

-- New non-recursive policy for viewing users
CREATE POLICY "Organization based user access"
    ON users FOR SELECT
    TO authenticated
    USING (
        -- User can see their own record
        id = auth.uid()
        OR (
            -- Check if the authenticated user has access to this organization's data
            EXISTS (
                SELECT 1
                FROM users u
                WHERE u.id = auth.uid()
                AND u.deleted_at IS NULL
                AND (
                    -- Super admins can see all users
                    u.role = 'super_admin'
                    -- Users can see others in their organization
                    OR (u.organization_id = users.organization_id AND u.organization_id IS NOT NULL)
                )
            )
        )
    );

-- New non-recursive policy for updating users
CREATE POLICY "Organization based user updates"
    ON users FOR UPDATE
    TO authenticated
    USING (
        -- Users can update their own record
        id = auth.uid()
        OR (
            -- Check if the authenticated user has admin access
            EXISTS (
                SELECT 1
                FROM users u
                WHERE u.id = auth.uid()
                AND u.deleted_at IS NULL
                AND (
                    -- Super admins can update any user
                    u.role = 'super_admin'
                    -- Admins can update users in their organization
                    OR (u.role = 'admin' AND u.organization_id = users.organization_id AND u.organization_id IS NOT NULL)
                )
            )
        )
    )
    WITH CHECK (
        -- Same conditions for the new row state
        id = auth.uid()
        OR (
            EXISTS (
                SELECT 1
                FROM users u
                WHERE u.id = auth.uid()
                AND u.deleted_at IS NULL
                AND (
                    u.role = 'super_admin'
                    OR (u.role = 'admin' AND u.organization_id = users.organization_id AND u.organization_id IS NOT NULL)
                )
            )
        )
    );

-- Update policies for other tables to respect organization boundaries

-- Update companies policies
DROP POLICY IF EXISTS "Everyone can view companies" ON companies;
CREATE POLICY "Organization based company access"
    ON companies FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1
            FROM users u
            WHERE u.id = auth.uid()
            AND u.deleted_at IS NULL
            AND (
                u.role = 'super_admin'
                OR u.organization_id = companies.organization_id
            )
        )
    );

-- Update follow_ups policies to respect organization boundaries
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON follow_ups;
CREATE POLICY "Organization based follow_ups access"
    ON follow_ups FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM users u
            WHERE u.id = auth.uid()
            AND u.deleted_at IS NULL
            AND (
                u.role = 'super_admin'
                OR u.organization_id = (
                    SELECT organization_id
                    FROM users target_user
                    WHERE target_user.id = follow_ups.user_id
                )
            )
        )
    );

-- Update communications policies to respect organization boundaries
DROP POLICY IF EXISTS "Agents can view communications they're involved with" ON communications;
CREATE POLICY "Organization based communications access"
    ON communications FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM users u
            WHERE u.id = auth.uid()
            AND u.deleted_at IS NULL
            AND (
                -- Super admins can see all communications
                u.role = 'super_admin'
                -- Users can see communications within their organization
                OR u.organization_id = (
                    SELECT organization_id
                    FROM users target_user
                    WHERE target_user.id = communications.user_id
                )
                -- Agents can see communications they're involved with
                OR auth.uid() = communications.agent_id
            )
        )
    ); 