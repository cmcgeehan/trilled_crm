-- Create calls table
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  status TEXT NOT NULL,
  duration INTEGER DEFAULT 0,
  recording_url TEXT,
  communication_id INTEGER REFERENCES communications(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Users can view their own calls
CREATE POLICY "Users can view their own calls" ON calls
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert and update calls
CREATE POLICY "Service role can manage calls" ON calls
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create function to update updated_at timestamp
CREATE TRIGGER update_calls_updated_at
  BEFORE UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 