-- Create lead_type enum
CREATE TYPE lead_type AS ENUM ('B2B', 'B2C');

-- Add lead_type column to users table
ALTER TABLE users 
ADD COLUMN lead_type lead_type;

-- Add comment to explain the column
COMMENT ON COLUMN users.lead_type IS 'Indicates whether the lead is B2B (from referral partners) or B2C (from direct channels)';

-- Update existing leads to be B2B by default
UPDATE users 
SET lead_type = 'B2B'::lead_type 
WHERE role = 'lead' AND lead_type IS NULL; 