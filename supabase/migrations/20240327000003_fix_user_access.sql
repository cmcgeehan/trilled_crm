-- First, drop all policies that depend on user_access_cache
DROP POLICY IF EXISTS "Users can view their organization's companies" ON companies;
DROP POLICY IF EXISTS "Organization admins can manage companies" ON companies;
DROP POLICY IF EXISTS "organizations_super_admin_all" ON organizations;
DROP POLICY IF EXISTS "organizations_member_view" ON organizations;
DROP POLICY IF EXISTS "organizations_admin_update" ON organizations;

-- Then drop other conflicting policies
DROP POLICY IF EXISTS "users_self_view" ON users;
DROP POLICY IF EXISTS "users_self_update" ON users;
DROP POLICY IF EXISTS "users_super_admin_all" ON users;
DROP POLICY IF EXISTS "Organization based user access" ON users;
DROP POLICY IF EXISTS "Organization based user updates" ON users;
DROP POLICY IF EXISTS "Organization based company access" ON companies;
DROP POLICY IF EXISTS "companies_select_policy" ON companies;

-- Drop triggers first
DROP TRIGGER IF EXISTS sync_user_access_cache_trigger ON users;
DROP TRIGGER IF EXISTS refresh_user_roles_trigger ON users;

-- Now we can safely drop the cache table and related functions
DROP TABLE IF EXISTS user_access_cache;
DROP FUNCTION IF EXISTS sync_user_access_cache();
DROP FUNCTION IF EXISTS refresh_user_roles();

-- Create a new secure function to check user role and access
CREATE OR REPLACE FUNCTION check_user_access(check_user_id uuid)
RETURNS TABLE (
    is_self boolean,
    is_super_admin boolean,
    is_admin boolean,
    organization_id uuid
) SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        check_user_id = auth.uid(),
        role = 'super_admin'::user_role,
        role = 'admin'::user_role,
        u.organization_id
    FROM users u
    WHERE u.id = auth.uid()
    AND u.deleted_at IS NULL;
END;
$$;

-- Create new simplified policies for users table
CREATE POLICY "users_access_policy" ON users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM check_user_access(id) access
            WHERE 
                access.is_self 
                OR access.is_super_admin 
                OR (access.is_admin AND access.organization_id = users.organization_id)
        )
    );

CREATE POLICY "users_update_policy" ON users
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM check_user_access(id) access
            WHERE 
                access.is_self 
                OR access.is_super_admin 
                OR (access.is_admin AND access.organization_id = users.organization_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM check_user_access(id) access
            WHERE 
                access.is_self 
                OR access.is_super_admin 
                OR (access.is_admin AND access.organization_id = users.organization_id)
        )
    );

-- Update organizations policies to use the new function
DROP POLICY IF EXISTS "super_admins_full_access" ON organizations;
DROP POLICY IF EXISTS "users_view_own_organization" ON organizations;

CREATE POLICY "organizations_access_policy" ON organizations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM check_user_access(auth.uid()) access
            WHERE 
                access.is_super_admin 
                OR access.organization_id = organizations.id
        )
    );

CREATE POLICY "organizations_update_policy" ON organizations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM check_user_access(auth.uid()) access
            WHERE 
                access.is_super_admin 
                OR (access.is_admin AND access.organization_id = organizations.id)
        )
    );

-- Create new companies policies
CREATE POLICY "companies_access_policy" ON companies
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM check_user_access(auth.uid()) access
            WHERE 
                access.is_super_admin 
                OR access.organization_id = companies.organization_id
        )
    ); 