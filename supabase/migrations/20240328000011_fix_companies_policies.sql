-- Drop all existing companies policies
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "companies_select_policy" ON companies;
DROP POLICY IF EXISTS "companies_access_policy" ON companies;
DROP POLICY IF EXISTS "Organization based company access" ON companies;
DROP POLICY IF EXISTS "Everyone can view companies" ON companies;
DROP POLICY IF EXISTS "Admins can manage companies" ON companies;

-- Create new policies for companies table
CREATE POLICY "companies_select" ON companies
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR users.organization_id = companies.organization_id
            )
        )
    );

CREATE POLICY "companies_insert" ON companies
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR (
                    users.role = 'admin'
                    AND users.organization_id = organization_id
                )
            )
        )
    );

CREATE POLICY "companies_update" ON companies
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR (
                    users.role = 'admin'
                    AND users.organization_id = companies.organization_id
                )
            )
        )
    )
    WITH CHECK (
        organization_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR (
                    users.role = 'admin'
                    AND users.organization_id = organization_id
                )
            )
        )
    );

CREATE POLICY "companies_delete" ON companies
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR (
                    users.role = 'admin'
                    AND users.organization_id = companies.organization_id
                )
            )
        )
    ); 