-- Add the new completed column
ALTER TABLE follow_ups ADD COLUMN completed BOOLEAN DEFAULT FALSE;

-- Copy data from complete to completed if complete exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'follow_ups' 
    AND column_name = 'complete'
  ) THEN
    UPDATE follow_ups SET completed = complete;
    ALTER TABLE follow_ups DROP COLUMN complete;
  END IF;
END $$;

-- Create index for the new column
CREATE INDEX follow_ups_completed_idx ON follow_ups(completed); 