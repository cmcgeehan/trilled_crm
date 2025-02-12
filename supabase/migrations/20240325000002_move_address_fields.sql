-- Add address fields to companies table
ALTER TABLE companies
    ADD COLUMN street_address TEXT,
    ADD COLUMN neighborhood TEXT,
    ADD COLUMN city TEXT,
    ADD COLUMN state TEXT,
    ADD COLUMN postal_code TEXT,
    ADD COLUMN country TEXT;

-- Remove address fields from users table
ALTER TABLE users
    DROP COLUMN IF EXISTS street_address,
    DROP COLUMN IF EXISTS neighborhood,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS state,
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS country; 