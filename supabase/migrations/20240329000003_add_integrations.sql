-- Create integrations table
create table if not exists public.integrations (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(id) on delete cascade not null,
    provider varchar not null,
    type varchar not null check (type in ('phone', 'sms')),
    credentials jsonb default '{}'::jsonb,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    deleted_at timestamp with time zone default null
);

-- Create updated_at trigger
create trigger handle_integrations_updated_at
    before update on public.integrations
    for each row
    execute procedure public.handle_updated_at();

-- Create indexes
create index if not exists integrations_user_id_idx on public.integrations(user_id);
create index if not exists integrations_provider_idx on public.integrations(provider);
create index if not exists integrations_type_idx on public.integrations(type);

-- Add RLS policies
alter table public.integrations enable row level security;

-- Policy for viewing integrations
create policy "Users can view own integrations"
    on public.integrations
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

-- Policy for inserting integrations
create policy "Users can add own integrations"
    on public.integrations
    for insert
    with check (
        auth.uid() = user_id
    );

-- Policy for updating integrations
create policy "Users can update own integrations"
    on public.integrations
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

-- Policy for deleting integrations
create policy "Users can delete own integrations"
    on public.integrations
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
comment on table public.integrations is 'Stores phone and SMS integration settings for users'; 