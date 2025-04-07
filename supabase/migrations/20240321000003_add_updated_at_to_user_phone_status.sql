-- Add updated_at column to user_phone_status table
ALTER TABLE user_phone_status ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update updated_at on update
CREATE TRIGGER update_user_phone_status_updated_at
    BEFORE UPDATE ON user_phone_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 