-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own B2C lead info" ON b2c_lead_info;
DROP POLICY IF EXISTS "Users can update B2C lead info" ON b2c_lead_info;
DROP POLICY IF EXISTS "Users can insert B2C lead info" ON b2c_lead_info;

-- Recreate policies with correct permissions
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