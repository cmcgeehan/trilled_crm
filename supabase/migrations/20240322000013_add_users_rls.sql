-- Drop existing policies
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can create users" ON public.users;
DROP POLICY IF EXISTS "Service role has full access" ON public.users;
DROP POLICY IF EXISTS "Admins can create users" ON public.users;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all users
CREATE POLICY "Users can view all users"
ON public.users FOR SELECT
TO authenticated
USING (true);

-- Allow users to update their own data
CREATE POLICY "Users can update own data"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow admins to update any user
CREATE POLICY "Admins can update any user"
ON public.users FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND (public.users.role = 'admin' OR public.users.role = 'super_admin')
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