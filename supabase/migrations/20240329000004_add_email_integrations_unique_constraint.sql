-- Add unique index for the columns we want to use in upsert
CREATE UNIQUE INDEX IF NOT EXISTS email_integrations_user_provider_email_idx 
ON public.email_integrations (user_id, provider, email) 
WHERE deleted_at IS NULL;

-- Add unique constraint using the index
ALTER TABLE public.email_integrations
ADD CONSTRAINT email_integrations_user_id_provider_email_key
UNIQUE USING INDEX email_integrations_user_provider_email_idx; 