-- Create user_phone_status table
CREATE TABLE user_phone_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  status TEXT NOT NULL DEFAULT 'available',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE user_phone_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own status
CREATE POLICY "Users can view their own status" ON user_phone_status
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own status
CREATE POLICY "Users can update their own status" ON user_phone_status
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own status
CREATE POLICY "Users can insert their own status" ON user_phone_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to update last_updated timestamp
CREATE TRIGGER update_user_phone_status_last_updated
  BEFORE UPDATE ON user_phone_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 