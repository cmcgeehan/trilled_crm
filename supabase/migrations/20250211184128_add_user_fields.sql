-- Add new columns to users table
ALTER TABLE users
ADD COLUMN phone TEXT,
ADD COLUMN email TEXT,
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT,
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'lost')),
ADD COLUMN lost_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN lost_reason TEXT;

-- Add indexes for commonly queried fields
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Add constraints
ALTER TABLE users
ADD CONSTRAINT users_email_unique UNIQUE (email),
ADD CONSTRAINT users_phone_unique UNIQUE (phone);
