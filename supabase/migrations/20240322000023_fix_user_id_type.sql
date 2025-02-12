-- Drop existing foreign key constraints if any
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_owner_id_fkey;

-- Create a temporary table with the correct schema
CREATE TABLE public.users_new (
    id UUID PRIMARY KEY,
    email TEXT,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    notes TEXT,
    role user_role NOT NULL DEFAULT 'lead',
    status TEXT NOT NULL DEFAULT 'active',
    lost_reason TEXT,
    lost_at TIMESTAMPTZ,
    owner_id UUID REFERENCES public.users_new(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Copy data from old table to new table, joining with auth.users to get UUIDs
INSERT INTO public.users_new (
    id, email, phone, first_name, last_name, company, notes,
    role, status, lost_reason, lost_at, owner_id, created_at,
    updated_at, deleted_at
)
SELECT 
    au.id,  -- Use UUID from auth.users
    COALESCE(pu.email, au.email),  -- Prefer public.users email but fall back to auth.users
    pu.phone,
    pu.first_name,
    pu.last_name,
    pu.company,
    pu.notes,
    pu.role,
    pu.status,
    pu.lost_reason,
    pu.lost_at,
    NULL as owner_id,  -- We'll need to update owner_id relationships separately
    COALESCE(pu.created_at, NOW()),
    COALESCE(pu.updated_at, NOW()),
    pu.deleted_at
FROM auth.users au
LEFT JOIN public.users pu ON pu.email = au.email
WHERE au.email IS NOT NULL;

-- Drop the old table and rename the new one
DROP TABLE public.users;
ALTER TABLE public.users_new RENAME TO users;

-- Add foreign key constraint to auth.users
ALTER TABLE public.users
ADD CONSTRAINT users_id_fkey
FOREIGN KEY (id) REFERENCES auth.users(id); 