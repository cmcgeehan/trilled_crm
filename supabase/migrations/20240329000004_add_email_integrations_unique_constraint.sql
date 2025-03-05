-- Add unique constraint to email_integrations
ALTER TABLE public.email_integrations
ADD CONSTRAINT email_integrations_user_id_provider_email_key
UNIQUE (user_id, provider, email)
WHERE deleted_at IS NULL; 