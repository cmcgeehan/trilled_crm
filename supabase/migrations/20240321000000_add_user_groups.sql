-- Create user groups table
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  twilio_phone TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group memberships table
CREATE TABLE group_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

-- Add RLS policies
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;

-- Policies for user_groups
CREATE POLICY "Users can view all groups" ON user_groups
  FOR SELECT USING (true);

CREATE POLICY "Only super admins can create groups" ON user_groups
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'super_admin'
  );

CREATE POLICY "Only super admins can update groups" ON user_groups
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'super_admin'
  );

-- Policies for group_memberships
CREATE POLICY "Users can view all group memberships" ON group_memberships
  FOR SELECT USING (true);

CREATE POLICY "Only super admins can manage memberships" ON group_memberships
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'super_admin'
  );

-- Insert default admissions group
INSERT INTO user_groups (name, description)
VALUES ('admissions', 'Admissions team members');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for user_groups
CREATE TRIGGER update_user_groups_updated_at
  BEFORE UPDATE ON user_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 