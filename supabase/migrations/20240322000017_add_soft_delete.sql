-- Add deleted_at column to users table
ALTER TABLE users
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for performance
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Update RLS policy to exclude deleted users
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
CREATE POLICY "Enable read access for authenticated users" ON users
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL); 