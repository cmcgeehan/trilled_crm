-- Rename the complete column to completed
ALTER TABLE follow_ups RENAME COLUMN complete TO completed;

-- Update any functions that reference the old column name
CREATE OR REPLACE FUNCTION update_user_statuses_for_followups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update users to 'follow_up' status if they have incomplete follow-ups today
  UPDATE users
  SET 
    status = 'follow_up',
    updated_at = NOW()
  FROM follow_ups
  WHERE 
    users.id = follow_ups.user_id
    AND follow_ups.completed = false
    AND follow_ups.deleted_at IS NULL
    AND DATE(follow_ups.date) = CURRENT_DATE
    AND users.deleted_at IS NULL
    AND users.role = 'lead'
    AND users.status != 'lost'
    AND users.status != 'won';

  -- Log that the job ran
  RAISE NOTICE 'User status update job completed at %', NOW();
END;
$$; 