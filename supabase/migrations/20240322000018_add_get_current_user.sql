-- Create function to get current user
CREATE OR REPLACE FUNCTION get_current_user()
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  first_name text,
  last_name text,
  company text,
  notes text,
  role user_role,
  status text,
  lost_reason text,
  lost_at timestamptz,
  owner_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT u.*
  FROM users u
  WHERE u.id = auth.uid()
  AND u.deleted_at IS NULL;
END;
$$; 