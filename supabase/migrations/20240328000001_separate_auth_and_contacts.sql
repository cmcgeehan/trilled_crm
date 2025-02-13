-- Drop the existing foreign key constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Create a function to validate user roles and auth status
CREATE OR REPLACE FUNCTION validate_user_auth()
RETURNS TRIGGER AS $$
BEGIN
    -- For leads and customers, ensure they don't have auth accounts
    IF NEW.role IN ('lead', 'customer') THEN
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Leads and customers cannot have auth accounts';
        END IF;
    -- For application users, ensure they have auth accounts
    ELSIF NEW.role IN ('agent', 'admin', 'super_admin') THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Agents, admins, and super admins must have auth accounts';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for the validation
DROP TRIGGER IF EXISTS validate_user_auth_trigger ON users;
CREATE TRIGGER validate_user_auth_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_auth();

-- Update the handle_new_user trigger function to only create records for application users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create public.users records for application users
    INSERT INTO public.users (
        id,
        email,
        role,
        status,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        'agent',  -- Default new auth users to agent role
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh the materialized view to reflect these changes
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles; 