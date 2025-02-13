-- Drop the automatic user creation trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Keep only the validation trigger
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

-- Recreate the validation trigger
DROP TRIGGER IF EXISTS validate_user_auth_trigger ON users;
CREATE TRIGGER validate_user_auth_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_auth();

-- Refresh the materialized view to reflect these changes
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles; 