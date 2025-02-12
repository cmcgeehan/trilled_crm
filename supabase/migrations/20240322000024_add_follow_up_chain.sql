-- Add next_follow_up_id column to follow_ups table
ALTER TABLE follow_ups
ADD COLUMN next_follow_up_id UUID REFERENCES follow_ups(id);

-- Create index for performance
CREATE INDEX idx_follow_ups_next_follow_up_id ON follow_ups(next_follow_up_id);

-- Update the types in the database
ALTER TYPE follow_up_type ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE follow_up_type ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE follow_up_type ADD VALUE IF NOT EXISTS 'call';
ALTER TYPE follow_up_type ADD VALUE IF NOT EXISTS 'meeting';
ALTER TYPE follow_up_type ADD VALUE IF NOT EXISTS 'tour'; 