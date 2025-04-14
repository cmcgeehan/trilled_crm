-- Add voip_enabled column to users table
ALTER TABLE users ADD COLUMN voip_enabled BOOLEAN DEFAULT FALSE;

-- Update existing users to have VoIP enabled by default
UPDATE users SET voip_enabled = TRUE; 