-- Drop existing insert policy
DROP POLICY IF EXISTS "users_insert" ON users;

-- Create a simple policy that only allows the service role to insert records
CREATE POLICY "service_role_insert" ON users
    FOR INSERT
    TO service_role
    WITH CHECK (true); 