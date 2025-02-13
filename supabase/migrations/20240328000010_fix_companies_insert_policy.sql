-- Drop any conflicting policies first
DROP POLICY IF EXISTS "companies_insert" ON companies;

-- Create new INSERT policy for companies
CREATE POLICY "companies_insert" ON companies
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Require organization_id to be set
        organization_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.deleted_at IS NULL
            AND (
                -- Super admins can create companies in any organization
                users.role = 'super_admin'
                -- Admins can only create companies in their organization
                OR (
                    users.role = 'admin'
                    AND users.organization_id = companies.organization_id
                )
            )
        )
    ); 