-- Update organizations RLS policies to allow super_admin access
DROP POLICY IF EXISTS "Organization members can view their organization" ON organizations;
CREATE POLICY "Organization members and super_admins can view organizations"
    ON organizations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.organization_id = organizations.id
                OR users.role = 'super_admin'
            )
        )
    );

DROP POLICY IF EXISTS "Organization admins can update their organization" ON organizations;
CREATE POLICY "Organization admins and super_admins can update organizations"
    ON organizations FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                (users.organization_id = organizations.id AND users.role = 'admin')
                OR users.role = 'super_admin'
            )
        )
    );

-- Add policy for super_admins to create organizations
CREATE POLICY "Super admins can create organizations"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.deleted_at IS NULL
        )
    );

-- Add policy for super_admins to delete organizations
CREATE POLICY "Super admins can delete organizations"
    ON organizations FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.deleted_at IS NULL
        )
    );

-- Update users RLS policies to allow super_admin access
DROP POLICY IF EXISTS "Users can view organization members" ON users;
CREATE POLICY "Users can view organization members and super_admins can view all"
    ON users FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users viewer
            WHERE viewer.id = auth.uid()
            AND viewer.deleted_at IS NULL
            AND (
                viewer.role = 'super_admin'
                OR viewer.organization_id = users.organization_id
            )
        )
    );

-- Add policy for super_admins to update any user
CREATE POLICY "Super admins can update any user"
    ON users FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.deleted_at IS NULL
        )
    );

-- Add policy for super_admins to create users
CREATE POLICY "Super admins can create users"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.deleted_at IS NULL
        )
    ); 