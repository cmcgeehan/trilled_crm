-- Drop any existing NOT NULL constraint on email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Drop any unique constraint on email if it exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

-- Drop any foreign key constraint that might reference auth.users based on email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Re-add the foreign key constraint to auth.users without email dependency
ALTER TABLE users
ADD CONSTRAINT users_id_fkey
FOREIGN KEY (id) REFERENCES auth.users(id); 