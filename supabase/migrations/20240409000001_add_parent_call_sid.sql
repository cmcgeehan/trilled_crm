-- Add parent_call_sid column to calls table
ALTER TABLE calls ADD COLUMN parent_call_sid TEXT;

-- Add index for faster lookups
CREATE INDEX idx_calls_parent_call_sid ON calls(parent_call_sid);

-- Add comment to column
COMMENT ON COLUMN calls.parent_call_sid IS 'The Twilio Call SID of the parent call for this call leg'; 