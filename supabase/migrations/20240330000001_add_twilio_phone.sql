-- Add twilio_phone column to users table
ALTER TABLE users ADD COLUMN twilio_phone TEXT;

-- Add comment to column
COMMENT ON COLUMN users.twilio_phone IS 'The Twilio phone number assigned to this user for voice calls';

-- Add index for faster lookups
CREATE INDEX idx_users_twilio_phone ON users(twilio_phone); 