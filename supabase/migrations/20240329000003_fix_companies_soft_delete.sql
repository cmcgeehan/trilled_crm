-- Drop existing policies
DROP POLICY IF EXISTS "companies_select" ON companies;
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "companies_update" ON companies;
DROP POLICY IF EXISTS "companies_delete" ON companies;

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
                    users.role IN ('admin', 'agent')
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
                    users.role IN ('admin', 'agent')
                    AND users.organization_id = companies.organization_id
                )
            )
        )
    )
    WITH CHECK (
        -- Allow setting deleted_at for admins and super_admins
        (deleted_at IS NOT NULL AND EXISTS (
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
        ))
        OR
        -- For regular updates, ensure organization_id matches
        (deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                users.role = 'super_admin'
                OR (
                    users.role IN ('admin', 'agent')
                    AND users.organization_id = companies.organization_id
                )
            )
        ))
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