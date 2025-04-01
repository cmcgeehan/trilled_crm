-- First, create a temporary column to store the old values
ALTER TABLE users ADD COLUMN temp_lead_type TEXT;

-- Copy existing lead_type values to the temporary column
UPDATE users SET temp_lead_type = lead_type;

-- Drop the existing lead_type column
ALTER TABLE users DROP COLUMN lead_type;

-- Drop the existing enum type if it exists
DROP TYPE IF EXISTS lead_type;

-- Create the new enum type
CREATE TYPE lead_type AS ENUM ('referral_partner', 'potential_customer');

-- Add the lead_type column back with the new enum type
ALTER TABLE users ADD COLUMN lead_type lead_type;

-- Update existing records based on their role
UPDATE users 
SET lead_type = CASE 
    WHEN role = 'lead' THEN 'potential_customer'::lead_type
    WHEN role = 'customer' THEN 'referral_partner'::lead_type
    ELSE NULL
END;

-- Drop the temporary column
ALTER TABLE users DROP COLUMN temp_lead_type; 