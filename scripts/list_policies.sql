-- List all policies and their definitions
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- List all RLS enabled tables
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = true
ORDER BY tablename;

-- List all functions that might be used in policies
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    p.proname LIKE '%user%'
    OR p.proname LIKE '%auth%'
    OR p.proname LIKE '%role%'
    OR p.proname LIKE '%policy%'
    OR p.proname LIKE '%permission%'
)
ORDER BY p.proname; 