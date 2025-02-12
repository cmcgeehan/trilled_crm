-- First, disable RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own data." ON users;
DROP POLICY IF EXISTS "Users can update their own data." ON users;

-- Create the user_role type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('lead', 'customer', 'agent', 'admin', 'super_admin');
    END IF;
END$$;

-- Add missing columns and role column if they don't exist
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email' AND table_schema = 'public') THEN
        ALTER TABLE public.users ADD COLUMN email TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone' AND table_schema = 'public') THEN
        ALTER TABLE public.users ADD COLUMN phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status' AND table_schema = 'public') THEN
        ALTER TABLE public.users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'lost_at' AND table_schema = 'public') THEN
        ALTER TABLE public.users ADD COLUMN lost_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'lost_reason' AND table_schema = 'public') THEN
        ALTER TABLE public.users ADD COLUMN lost_reason TEXT;
    END IF;

    -- Check if role column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role' AND table_schema = 'public') THEN
        -- Add the column if it doesn't exist
        ALTER TABLE public.users ADD COLUMN role user_role NOT NULL DEFAULT 'lead';
    ELSE
        -- Convert existing column from TEXT to user_role
        ALTER TABLE public.users
            ALTER COLUMN role DROP DEFAULT,
            ALTER COLUMN role TYPE user_role USING
                CASE
                    WHEN role = 'lead' THEN 'lead'::user_role
                    WHEN role = 'customer' THEN 'customer'::user_role
                    WHEN role = 'agent' THEN 'agent'::user_role
                    WHEN role = 'admin' THEN 'admin'::user_role
                    WHEN role = 'super_admin' THEN 'super_admin'::user_role
                    ELSE 'lead'::user_role
                END,
            ALTER COLUMN role SET DEFAULT 'lead';
    END IF;
END $$;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Recreate the policies
CREATE POLICY "Users can view their own data."
    ON users FOR SELECT
    USING (
        auth.uid() = id
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('agent', 'admin', 'super_admin')
    );

CREATE POLICY "Users can update their own data."
    ON users FOR UPDATE
    USING (
        auth.uid() = id
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('agent', 'admin', 'super_admin')
    )
    WITH CHECK (
        auth.uid() = id
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('agent', 'admin', 'super_admin')
    );

-- Function to sync auth users to public users
CREATE OR REPLACE FUNCTION sync_auth_users()
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM auth.users
    LOOP
        INSERT INTO public.users (id, email, role, status)
        VALUES (
            r.id::text::uuid,
            r.email,
            'lead'::user_role,
            'active'
        )
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync function
SELECT sync_auth_users();

-- Update trigger function to handle all columns
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
    _uuid uuid;
BEGIN
    -- Convert the bigint to UUID
    _uuid := new.id::text::uuid;
    
    INSERT INTO public.users (
        id,
        email,
        role,
        status,
        phone,
        lost_at,
        lost_reason
    )
    VALUES (
        _uuid,
        new.email,
        'lead'::user_role,
        'active',
        NULL,
        NULL,
        NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        status = EXCLUDED.status;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 