-- Update the admissions group with the Twilio number
UPDATE user_groups
SET twilio_number = '+18335737276'
WHERE name = 'admissions';

-- Verify the update
SELECT id, name, twilio_number FROM user_groups WHERE name = 'admissions'; 