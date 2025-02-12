-- Drop primary key and all dependent constraints with CASCADE
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_pkey CASCADE;

-- Drop any remaining constraints that might reference id
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_owner_id_fkey CASCADE;
ALTER TABLE public.follow_ups DROP CONSTRAINT IF EXISTS follow_ups_user_id_fkey CASCADE;

-- Make new_id the primary key
ALTER TABLE public.users ADD PRIMARY KEY (new_id);

-- Re-add the foreign key constraints to reference new_id
ALTER TABLE public.users 
  ADD CONSTRAINT users_owner_id_fkey 
  FOREIGN KEY (owner_id) REFERENCES public.users(new_id);

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(new_id);

-- Now we can safely drop the old id column
ALTER TABLE public.users DROP COLUMN id;

-- Rename new_id to id
ALTER TABLE public.users RENAME COLUMN new_id TO id;

-- Add the foreign key constraint to auth.users
ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id); 