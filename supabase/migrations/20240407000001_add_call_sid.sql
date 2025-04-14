-- Add call_sid column to calls table
ALTER TABLE calls ADD COLUMN call_sid TEXT;

-- Add index for faster lookups
CREATE INDEX idx_calls_call_sid ON calls(call_sid);

-- Add comment to column
COMMENT ON COLUMN calls.call_sid IS 'The Twilio Call SID for this call'; 