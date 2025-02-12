-- Create follow_ups table
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complete BOOLEAN DEFAULT FALSE,
  next_follow_up_id UUID REFERENCES follow_ups(id) ON DELETE SET NULL,
  notes TEXT
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
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

-- Create index for performance
CREATE INDEX follow_ups_user_id_idx ON follow_ups(user_id);
CREATE INDEX follow_ups_date_idx ON follow_ups(date);
CREATE INDEX follow_ups_complete_idx ON follow_ups(complete); 