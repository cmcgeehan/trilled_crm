-- Add referral_company_id column to users table with foreign key constraint
ALTER TABLE users 
ADD COLUMN referral_company_id UUID REFERENCES companies(id);

-- Add a check constraint to ensure referral_company_id is only set for B2C leads
ALTER TABLE users
ADD CONSTRAINT check_referral_company_id
CHECK (
  (lead_type = 'B2C' AND referral_company_id IS NOT NULL) OR
  (lead_type = 'B2B' AND referral_company_id IS NULL) OR
  (lead_type IS NULL AND referral_company_id IS NULL)
);

-- Create an index for performance
CREATE INDEX idx_users_referral_company_id ON users(referral_company_id); 