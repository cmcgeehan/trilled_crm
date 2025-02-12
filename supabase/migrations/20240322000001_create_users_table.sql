-- Create users table
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    role TEXT NOT NULL DEFAULT 'lead',
    status TEXT NOT NULL DEFAULT 'active',
    lost_reason TEXT,
    lost_at TIMESTAMPTZ,
    owner_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
); 