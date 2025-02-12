-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create updated function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new record into public.users
  INSERT INTO public.users (
    id,           -- This is now a UUID field
    email,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,       -- Use the UUID from auth.users
    NEW.email,
    'lead',
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Log the insertion for debugging
  RAISE NOTICE 'Created public.users record with id: %', NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 