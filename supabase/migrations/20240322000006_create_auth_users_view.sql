-- Create a view to safely expose auth.users data
CREATE OR REPLACE VIEW auth_users_view AS
SELECT 
    id,
    email,
    raw_user_meta_data->>'role' as role,
    created_at,
    last_sign_in_at,
    updated_at
FROM auth.users;

-- Grant access to the authenticated users
GRANT SELECT ON auth_users_view TO authenticated;
GRANT SELECT ON auth_users_view TO service_role; 