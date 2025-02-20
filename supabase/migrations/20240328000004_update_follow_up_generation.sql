-- Update the function to generate follow-ups for customers
CREATE OR REPLACE FUNCTION update_user_statuses_and_generate_follow_ups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_record RECORD;
  v_look_ahead_days INTEGER := 30;
  v_last_follow_up_date TIMESTAMPTZ;
  v_next_follow_up_date TIMESTAMPTZ;
BEGIN
  -- Update user statuses (existing logic)
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

  -- Generate follow-ups for users who need them
  FOR v_user_record IN 
    SELECT DISTINCT u.id, u.role, u.created_at
    FROM users u
    WHERE u.deleted_at IS NULL
    AND u.role IN ('lead', 'customer')
    AND u.status != 'lost'
    AND (
      -- For leads, only generate if they have no follow-ups
      (u.role = 'lead' AND NOT EXISTS (
        SELECT 1 FROM follow_ups f 
        WHERE f.user_id = u.id 
        AND f.deleted_at IS NULL
      ))
      OR
      -- For customers, generate if their last follow-up is within the look-ahead window
      (u.role = 'customer' AND (
        NOT EXISTS (
          SELECT 1 FROM follow_ups f 
          WHERE f.user_id = u.id 
          AND f.deleted_at IS NULL
        )
        OR
        (SELECT MAX(date) FROM follow_ups 
         WHERE user_id = u.id 
         AND deleted_at IS NULL) < NOW() + (v_look_ahead_days || ' days')::INTERVAL
      ))
    )
  LOOP
    -- Get the last follow-up date for this user
    SELECT MAX(date)
    INTO v_last_follow_up_date
    FROM follow_ups
    WHERE user_id = v_user_record.id
    AND deleted_at IS NULL;

    -- If no last follow-up, use created_at date
    IF v_last_follow_up_date IS NULL THEN
      v_last_follow_up_date := v_user_record.created_at;
    END IF;

    -- For customers, create next weekly follow-up
    IF v_user_record.role = 'customer' THEN
      -- Calculate next follow-up date (7 days after last follow-up)
      v_next_follow_up_date := v_last_follow_up_date + '7 days'::INTERVAL;
      
      -- Only create if it's within our look-ahead window
      IF v_next_follow_up_date < NOW() + (v_look_ahead_days || ' days')::INTERVAL THEN
        INSERT INTO follow_ups (
          user_id,
          date,
          type,
          completed
        ) VALUES (
          v_user_record.id,
          v_next_follow_up_date,
          'email',
          false
        );
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'User status update and follow-up generation completed at %', NOW();
END;
$$; 