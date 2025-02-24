-- Drop existing policies
DROP POLICY IF EXISTS follow_ups_insert_v6 ON follow_ups;
DROP POLICY IF EXISTS follow_ups_select_v6 ON follow_ups;
DROP POLICY IF EXISTS follow_ups_update_v6 ON follow_ups;

-- Create new policies that check for user creator
CREATE POLICY follow_ups_insert_v7 ON follow_ups
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users auth_user
    WHERE auth_user.id = auth.uid()
    AND auth_user.deleted_at IS NULL
    AND (
      -- Allow admins and super_admins
      auth_user.role IN ('admin', 'super_admin')
      OR
      -- Allow agents for users they created
      (auth_user.role = 'agent' AND EXISTS (
        SELECT 1 FROM users target_user
        WHERE target_user.id = follow_ups.user_id
        AND target_user.created_by = auth_user.id
      ))
    )
  )
);

CREATE POLICY follow_ups_select_v7 ON follow_ups
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users auth_user
    WHERE auth_user.id = auth.uid()
    AND auth_user.deleted_at IS NULL
    AND (
      -- Allow admins and super_admins
      auth_user.role IN ('admin', 'super_admin')
      OR
      -- Allow agents for users they created
      (auth_user.role = 'agent' AND EXISTS (
        SELECT 1 FROM users target_user
        WHERE target_user.id = follow_ups.user_id
        AND target_user.created_by = auth_user.id
      ))
    )
  )
);

CREATE POLICY follow_ups_update_v7 ON follow_ups
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users auth_user
    WHERE auth_user.id = auth.uid()
    AND auth_user.deleted_at IS NULL
    AND (
      -- Allow admins and super_admins
      auth_user.role IN ('admin', 'super_admin')
      OR
      -- Allow agents for users they created
      (auth_user.role = 'agent' AND EXISTS (
        SELECT 1 FROM users target_user
        WHERE target_user.id = follow_ups.user_id
        AND target_user.created_by = auth_user.id
      ))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users auth_user
    WHERE auth_user.id = auth.uid()
    AND auth_user.deleted_at IS NULL
    AND (
      -- Allow admins and super_admins
      auth_user.role IN ('admin', 'super_admin')
      OR
      -- Allow agents for users they created
      (auth_user.role = 'agent' AND EXISTS (
        SELECT 1 FROM users target_user
        WHERE target_user.id = follow_ups.user_id
        AND target_user.created_by = auth_user.id
      ))
    )
  )
); 