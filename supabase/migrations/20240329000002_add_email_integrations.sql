-- Create email_integrations table
create table if not exists public.email_integrations (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(id) on delete cascade not null,
    provider varchar not null check (provider in ('gmail', 'outlook')),
    refresh_token text not null,
    access_token text,
    token_expires_at timestamp with time zone,
    email varchar not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    deleted_at timestamp with time zone default null
);

-- Create updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Add trigger to email_integrations
create trigger handle_email_integrations_updated_at
    before update on public.email_integrations
    for each row
    execute procedure public.handle_updated_at();

-- Create indexes
create index if not exists email_integrations_user_id_idx on public.email_integrations(user_id);
create index if not exists email_integrations_provider_idx on public.email_integrations(provider);
create index if not exists email_integrations_email_idx on public.email_integrations(email);

-- Add RLS policies
alter table public.email_integrations enable row level security;

-- Policy for viewing email integrations
-- Users can view their own integrations
-- Admins and super_admins can view all integrations
create policy "Users can view own email integrations"
    on public.email_integrations
    for select
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.users
            where users.id = auth.uid()
            and (users.role = 'admin' or users.role = 'super_admin')
            and users.deleted_at is null
        )
    );

-- Policy for inserting email integrations
-- Users can only add their own integrations
create policy "Users can add own email integrations"
    on public.email_integrations
    for insert
    with check (
        auth.uid() = user_id
    );

-- Policy for updating email integrations
-- Users can only update their own integrations
-- Admins and super_admins can update any integration
create policy "Users can update own email integrations"
    on public.email_integrations
    for update
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.users
            where users.id = auth.uid()
            and (users.role = 'admin' or users.role = 'super_admin')
            and users.deleted_at is null
        )
    );

-- Policy for deleting email integrations
-- Users can only delete their own integrations
-- Admins and super_admins can delete any integration
create policy "Users can delete own email integrations"
    on public.email_integrations
    for delete
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.users
            where users.id = auth.uid()
            and (users.role = 'admin' or users.role = 'super_admin')
            and users.deleted_at is null
        )
    );

-- Add comment to table
comment on table public.email_integrations is 'Stores email integration settings for users'; 