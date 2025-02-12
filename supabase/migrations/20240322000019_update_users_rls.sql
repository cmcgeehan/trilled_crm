-- Drop existing policies
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can create users" ON public.users;
DROP POLICY IF EXISTS "Service role has full access" ON public.users;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own data and any data they own
CREATE POLICY "Users can view own data and owned data"
ON public.users FOR SELECT
TO authenticated
USING (
  id::text = auth.uid()::text OR 
  owner_id::text = auth.uid()::text OR
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id::text = auth.uid()::text
    AND (u.role = 'admin' OR u.role = 'super_admin')
  )
);

-- Allow users to update their own data
CREATE POLICY "Users can update own data"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid()::text = id::text);

-- Allow admins to update any user
CREATE POLICY "Admins can update any user"
ON public.users FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id::text = auth.uid()::text
    AND (u.role = 'admin' OR u.role = 'super_admin')
  )
);

-- Allow authenticated users to create new users
CREATE POLICY "Authenticated users can create users"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow service role to do everything
CREATE POLICY "Service role has full access"
ON public.users
TO service_role
USING (true)
WITH CHECK (true); 