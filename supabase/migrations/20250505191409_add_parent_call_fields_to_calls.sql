-- Add is_parent_call column
ALTER TABLE public.calls
ADD COLUMN is_parent_call BOOLEAN DEFAULT FALSE;

-- Add parent_call_sid column
ALTER TABLE public.calls
ADD COLUMN parent_call_sid TEXT;

-- Add recording_sid column
ALTER TABLE public.calls
ADD COLUMN recording_sid TEXT;

-- Optional: Add an index if you frequently query by parent_call_sid
-- CREATE INDEX IF NOT EXISTS idx_calls_parent_call_sid ON public.calls(parent_call_sid);
