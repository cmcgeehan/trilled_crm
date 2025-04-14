-- Update the admissions group with the Twilio phone number
UPDATE user_groups
SET twilio_phone = '+18335737276'
WHERE name = 'admissions';

-- Verify the update
SELECT id, name, twilio_phone FROM user_groups WHERE name = 'admissions'; 