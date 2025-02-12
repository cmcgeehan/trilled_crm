-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON follow_ups;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON follow_ups;

-- Policy for inserting follow-ups
CREATE POLICY "Enable insert for authenticated users" ON follow_ups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow insert if:
    -- 1. The user_id references a user the authenticated user can access, OR
    -- 2. The user_id is for a user that was just created (within the last minute)
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
      AND (
        -- Regular access check
        users.owner_id::text = auth.uid()::text
        OR users.id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id::text = auth.uid()::text
          AND (u.role = 'admin' OR u.role = 'super_admin')
        )
        -- Allow for newly created users
        OR users.created_at >= NOW() - INTERVAL '1 minute'
      )
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
      AND (
        users.owner_id::text = auth.uid()::text
        OR users.id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id::text = auth.uid()::text
          AND (u.role = 'admin' OR u.role = 'super_admin')
        )
      )
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
      AND (
        users.owner_id::text = auth.uid()::text
        OR users.id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id::text = auth.uid()::text
          AND (u.role = 'admin' OR u.role = 'super_admin')
        )
      )
    )
  )
  WITH CHECK (
    -- Same condition for the new row
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_id
      AND users.deleted_at IS NULL
      AND (
        users.owner_id::text = auth.uid()::text
        OR users.id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id::text = auth.uid()::text
          AND (u.role = 'admin' OR u.role = 'super_admin')
        )
      )
    )
  ); 