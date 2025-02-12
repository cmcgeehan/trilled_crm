-- Drop existing policy
DROP POLICY IF EXISTS "Agents can create communications" ON communications;

-- Create new policy with expanded permissions
CREATE POLICY "Agents can create communications"
    ON communications FOR INSERT
    WITH CHECK (
        auth.uid() = agent_id OR
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('admin', 'super_admin') 
            AND deleted_at IS NULL
        )
    );

-- Update view policy to be more explicit
DROP POLICY IF EXISTS "Agents can view communications they're involved with" ON communications;

CREATE POLICY "Agents can view communications they're involved with"
    ON communications FOR SELECT
    USING (
        auth.uid() = agent_id OR
        auth.uid() IN (
            SELECT id FROM users 
            WHERE role IN ('admin', 'super_admin') 
            AND deleted_at IS NULL
        ) OR
        auth.uid() IN (
            SELECT owner_id FROM users
            WHERE id = communications.user_id
            AND deleted_at IS NULL
        )
    ); 