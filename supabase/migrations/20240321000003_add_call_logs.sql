-- Create call_logs table
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  case_id UUID REFERENCES cases(id),
  call_sid TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  duration INTEGER NOT NULL,
  recording_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own call logs
CREATE POLICY "Users can view their own call logs" ON call_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own call logs
CREATE POLICY "Users can insert their own call logs" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE TRIGGER update_call_logs_updated_at
  BEFORE UPDATE ON call_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 