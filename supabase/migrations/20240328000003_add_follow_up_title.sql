-- Add title column to follow_ups
ALTER TABLE follow_ups ADD COLUMN title TEXT;

-- Create index for searching by title
CREATE INDEX follow_ups_title_idx ON follow_ups(title); 