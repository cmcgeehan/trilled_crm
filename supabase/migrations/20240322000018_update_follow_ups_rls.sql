-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON follow_ups;

-- Policy for inserting follow-ups
CREATE POLICY "Enable insert for authenticated users" ON follow_ups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow insert if the user_id references a user the authenticated user can access
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
    )
  );

-- Policy for viewing follow-ups
CREATE POLICY "Enable read access for authenticated users" ON follow_ups
  FOR SELECT
  TO authenticated
  USING (
    -- Allow read if the user_id references a user the authenticated user can access
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
    )
  );

-- Policy for updating follow-ups
CREATE POLICY "Enable update for authenticated users" ON follow_ups
  FOR UPDATE
  TO authenticated
  USING (
    -- Allow update if the user_id references a user the authenticated user can access
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
    )
  )
  WITH CHECK (
    -- Same condition for the new row
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
    )
  ); 