-- Add foreign key constraint from calls.to_user_id to users.id
ALTER TABLE public.calls
ADD CONSTRAINT calls_to_user_id_fkey
FOREIGN KEY (to_user_id)
REFERENCES public.users (id)
ON UPDATE NO ACTION
ON DELETE NO ACTION;

-- Optional: Add comment for clarity (useful in Supabase UI)
COMMENT ON CONSTRAINT calls_to_user_id_fkey ON public.calls
IS 'Ensures that the receiving user (to_user_id) of a call exists in the users table.'; 