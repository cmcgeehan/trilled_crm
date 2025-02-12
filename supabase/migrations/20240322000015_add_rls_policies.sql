-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for inserting new users
CREATE POLICY "Enable insert for authenticated users" ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for viewing users
CREATE POLICY "Enable read access for authenticated users" ON users
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for updating users
CREATE POLICY "Enable update for authenticated users" ON users
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true); 