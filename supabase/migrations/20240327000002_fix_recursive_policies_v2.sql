-- First, disable RLS temporarily to fix any corrupted role data
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Create a function to get user role and org id that avoids recursion
CREATE OR REPLACE FUNCTION get_auth_user_role()
RETURNS TABLE (
    user_role user_role,
    org_id uuid
) SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT u.role, u.organization_id
    FROM users u
    WHERE u.id = auth.uid()
    AND u.deleted_at IS NULL;
END;
$$;

-- Drop all existing policies
DROP POLICY IF EXISTS "Organization based user access" ON users;
DROP POLICY IF EXISTS "Organization based user updates" ON users;
DROP POLICY IF EXISTS "Users can view organization members and super_admins can view all" ON users;
DROP POLICY IF EXISTS "Super admins can update any user" ON users;
DROP POLICY IF EXISTS "Users can view own data and owned data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can update any user" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create new non-recursive policies using the auth.jwt() function
CREATE POLICY "users_select_policy" ON users
    FOR SELECT TO authenticated
    USING (
        CASE
            -- Allow users to always see their own record
            WHEN id = auth.uid() THEN true
            -- For other records, check role and org
            ELSE (
                EXISTS (
                    SELECT user_role, org_id 
                    FROM get_auth_user_role() 
                    WHERE 
                        -- Super admins can see all
                        user_role = 'super_admin'
                        -- Others can only see within their org
                        OR (org_id = users.organization_id AND org_id IS NOT NULL)
                )
            )
        END
    );

-- Policy for updating users
CREATE POLICY "users_update_policy" ON users
    FOR UPDATE TO authenticated
    USING (
        CASE
            -- Users can update their own record
            WHEN id = auth.uid() THEN true
            -- For other records, check role and org
            ELSE (
                EXISTS (
                    SELECT user_role, org_id 
                    FROM get_auth_user_role()
                    WHERE 
                        -- Super admins can update any user
                        user_role = 'super_admin'
                        -- Admins can update users in their org
                        OR (user_role = 'admin' AND org_id = users.organization_id AND org_id IS NOT NULL)
                )
            )
        END
    )
    WITH CHECK (
        CASE
            -- Users can update their own record
            WHEN id = auth.uid() THEN true
            -- For other records, check role and org
            ELSE (
                EXISTS (
                    SELECT user_role, org_id 
                    FROM get_auth_user_role()
                    WHERE 
                        -- Super admins can update any user
                        user_role = 'super_admin'
                        -- Admins can update users in their org
                        OR (user_role = 'admin' AND org_id = users.organization_id AND org_id IS NOT NULL)
                )
            )
        END
    );

-- Create a policy for inserting users
CREATE POLICY "users_insert_policy" ON users
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT user_role 
            FROM get_auth_user_role()
            WHERE user_role IN ('admin', 'super_admin')
        )
    );

-- Create a policy for deleting users (soft delete)
CREATE POLICY "users_delete_policy" ON users
    FOR UPDATE TO authenticated
    USING (
        -- Only allow updates that set deleted_at
        NEW.deleted_at IS NOT NULL
        AND EXISTS (
            SELECT user_role, org_id 
            FROM get_auth_user_role()
            WHERE 
                -- Super admins can delete any user
                user_role = 'super_admin'
                -- Admins can delete users in their org
                OR (user_role = 'admin' AND org_id = users.organization_id AND org_id IS NOT NULL)
        )
    );

-- Update other tables' policies to use the new function

-- Update companies policies
DROP POLICY IF EXISTS "Organization based company access" ON companies;
CREATE POLICY "companies_access_policy" ON companies
    FOR SELECT TO authenticated
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT user_role, org_id 
            FROM get_auth_user_role()
            WHERE 
                user_role = 'super_admin'
                OR org_id = companies.organization_id
        )
    );

-- Update follow_ups policies
DROP POLICY IF EXISTS "Organization based follow_ups access" ON follow_ups;
CREATE POLICY "follow_ups_access_policy" ON follow_ups
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT user_role, org_id 
            FROM get_auth_user_role()
            WHERE 
                user_role = 'super_admin'
                OR org_id = (
                    SELECT organization_id
                    FROM users target_user
                    WHERE target_user.id = follow_ups.user_id
                    AND target_user.deleted_at IS NULL
                )
        )
    );

-- Update communications policies
DROP POLICY IF EXISTS "Organization based communications access" ON communications;
CREATE POLICY "communications_access_policy" ON communications
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT user_role, org_id 
            FROM get_auth_user_role()
            WHERE 
                user_role = 'super_admin'
                OR org_id = (
                    SELECT organization_id
                    FROM users target_user
                    WHERE target_user.id = communications.user_id
                    AND target_user.deleted_at IS NULL
                )
                OR auth.uid() = communications.agent_id
        )
    ); 