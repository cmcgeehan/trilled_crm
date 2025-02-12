-- Create companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Create index for performance
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_deleted_at ON companies(deleted_at);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Everyone can view companies"
    ON companies FOR SELECT
    TO authenticated
    USING (deleted_at IS NULL);

CREATE POLICY "Admins can manage companies"
    ON companies FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
            AND users.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
            AND users.deleted_at IS NULL
        )
    );

-- Add company_id to users table
ALTER TABLE users 
    ADD COLUMN company_id UUID REFERENCES companies(id);

-- Create index for the foreign key
CREATE INDEX idx_users_company_id ON users(company_id);

-- Migrate existing company names to the new table
DO $$
DECLARE
    company_name text;
    company_id uuid;
BEGIN
    -- For each distinct company name in users table
    FOR company_name IN 
        SELECT DISTINCT company 
        FROM users 
        WHERE company IS NOT NULL AND company != ''
    LOOP
        -- Insert into companies table
        INSERT INTO companies (name)
        VALUES (company_name)
        RETURNING id INTO company_id;

        -- Update users table
        UPDATE users 
        SET company_id = company_id
        WHERE company = company_name;
    END LOOP;
END $$;

-- Drop the old company column
ALTER TABLE users DROP COLUMN company; 