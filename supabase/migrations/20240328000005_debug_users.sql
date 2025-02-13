-- Check super admin users and their organization
SELECT 
    u.id,
    u.email,
    u.role,
    u.organization_id,
    u.deleted_at,
    o.name as organization_name
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.role = 'super_admin'
AND u.deleted_at IS NULL;

-- Check all users for The Pickle Co
SELECT 
    u.id,
    u.email,
    u.role,
    u.organization_id,
    u.deleted_at,
    o.name as organization_name
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE o.name ILIKE '%pickle%'
AND u.deleted_at IS NULL;

-- Check all organizations
SELECT 
    id,
    name,
    created_at,
    deleted_at
FROM organizations
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- Check user_roles materialized view
SELECT 
    id,
    role,
    organization_id,
    deleted_at
FROM user_roles
WHERE role = 'super_admin'
OR organization_id IN (
    SELECT id FROM organizations WHERE name ILIKE '%pickle%'
); 