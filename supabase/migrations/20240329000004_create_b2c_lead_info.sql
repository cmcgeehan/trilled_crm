-- Create b2c_lead_info table
CREATE TABLE b2c_lead_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say')),
    ssn_last_four TEXT NOT NULL,
    marital_status TEXT NOT NULL CHECK (marital_status IN ('Single', 'Married', 'Divorced', 'Widowed')),
    parental_status TEXT NOT NULL CHECK (parental_status IN ('Has children', 'No children')),
    referral_source TEXT NOT NULL,
    headshot_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id)
);

-- Create indexes
CREATE INDEX idx_b2c_lead_info_user_id ON b2c_lead_info(user_id);
CREATE INDEX idx_b2c_lead_info_created_by ON b2c_lead_info(created_by);
CREATE INDEX idx_b2c_lead_info_updated_by ON b2c_lead_info(updated_by);

-- Enable RLS
ALTER TABLE b2c_lead_info ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own B2C lead info"
    ON b2c_lead_info
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND (
                -- Staff roles can view all records
                auth_user.role IN ('admin', 'super_admin', 'agent')
                OR
                -- User can view their own records
                auth.uid() = b2c_lead_info.user_id
                OR
                -- Referrer can view their referral's records
                EXISTS (
                    SELECT 1 FROM users lead_user
                    WHERE lead_user.id = b2c_lead_info.user_id
                    AND lead_user.referrer_id = auth.uid()
                    AND lead_user.deleted_at IS NULL
                )
            )
            AND auth_user.deleted_at IS NULL
        )
    );

CREATE POLICY "Users can update B2C lead info"
    ON b2c_lead_info
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND (
                -- Staff roles can update all records
                auth_user.role IN ('admin', 'super_admin', 'agent')
                OR
                -- Referrer can update their referral's records
                EXISTS (
                    SELECT 1 FROM users lead_user
                    WHERE lead_user.id = b2c_lead_info.user_id
                    AND lead_user.referrer_id = auth.uid()
                    AND lead_user.deleted_at IS NULL
                )
            )
            AND auth_user.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND (
                -- Staff roles can update all records
                auth_user.role IN ('admin', 'super_admin', 'agent')
                OR
                -- Referrer can update their referral's records
                EXISTS (
                    SELECT 1 FROM users lead_user
                    WHERE lead_user.id = b2c_lead_info.user_id
                    AND lead_user.referrer_id = auth.uid()
                    AND lead_user.deleted_at IS NULL
                )
            )
            AND auth_user.deleted_at IS NULL
        )
    );

CREATE POLICY "Users can insert B2C lead info"
    ON b2c_lead_info
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users auth_user
            WHERE auth_user.id = auth.uid()
            AND (
                -- Staff roles can insert all records
                auth_user.role IN ('admin', 'super_admin', 'agent')
                OR
                -- Referrer can insert records for their referrals
                EXISTS (
                    SELECT 1 FROM users lead_user
                    WHERE lead_user.id = user_id
                    AND lead_user.referrer_id = auth.uid()
                    AND lead_user.deleted_at IS NULL
                )
            )
            AND auth_user.deleted_at IS NULL
        )
    );

-- Create trigger function for updated_at and updated_by
CREATE OR REPLACE FUNCTION update_b2c_lead_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    NEW.updated_by = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at and updated_by
CREATE TRIGGER set_b2c_lead_info_updated_at
    BEFORE UPDATE ON b2c_lead_info
    FOR EACH ROW
    EXECUTE FUNCTION update_b2c_lead_info_updated_at();

-- Create trigger function for created_by
CREATE OR REPLACE FUNCTION set_b2c_lead_info_created_by()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_by = auth.uid();
    NEW.updated_by = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for created_by
CREATE TRIGGER set_b2c_lead_info_created_by
    BEFORE INSERT ON b2c_lead_info
    FOR EACH ROW
    EXECUTE FUNCTION set_b2c_lead_info_created_by(); 