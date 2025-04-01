-- Drop conflicting policies
DROP POLICY IF EXISTS "companies_access" ON companies;
DROP POLICY IF EXISTS "companies_select" ON companies;

-- Create a single, clear SELECT policy for companies
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
                OR (
                    users.role IN ('admin', 'agent')
                    AND users.organization_id = companies.organization_id
                    AND users.organization_id IS NOT NULL
                )
            )
        )
    ); 