-- First, enable RLS on the users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Admins can view all users in their organization" ON users;
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can create users in their organization" ON users;
DROP POLICY IF EXISTS "Super admins can create any user" ON users;
DROP POLICY IF EXISTS "Admins can update users in their organization" ON users;
DROP POLICY IF EXISTS "Super admins can update any user" ON users;

-- Create policies for viewing users
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view their owners" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.owner_id = users.id
    )
  );

CREATE POLICY "Admins can view all users in their organization" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.organization_id = users.organization_id
    )
  );

CREATE POLICY "Super admins can view all users" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- Create policies for inserting users
CREATE POLICY "Admins can create users in their organization" ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.organization_id = users.organization_id
    )
  );

CREATE POLICY "Super admins can create any user" ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- Create policies for updating users
CREATE POLICY "Admins can update users in their organization" ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.organization_id = users.organization_id
    )
  );

CREATE POLICY "Super admins can update any user" ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'super_admin'
    )
  ); 