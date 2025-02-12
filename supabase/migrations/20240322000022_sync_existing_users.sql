-- Sync existing auth users to public.users
INSERT INTO public.users (id, email, role, status)
SELECT 
  id,
  email,
  'lead' as role,
  'active' as status
FROM auth.users
ON CONFLICT (id) DO NOTHING; 