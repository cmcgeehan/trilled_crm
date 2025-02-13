-- Add company_id column to users table with foreign key constraint
ALTER TABLE users ADD COLUMN company_id UUID REFERENCES companies(id); 