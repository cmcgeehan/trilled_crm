-- Initial Schema Setup

-- Required Extensions (Add here)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE EXTENSION IF NOT EXISTS moddatetime; -- If using this for updated_at triggers

-- Custom Types (Add definitions here, before tables)
CREATE TYPE "public"."follow_up_sequence_type" AS ENUM (
    'lead',
    'customer'
);

CREATE TYPE "public"."gender_type" AS ENUM (
    'Male',
    'Female',
    'Non-binary',
    'Other',
    'Prefer not to say'
);

CREATE TYPE "public"."lead_type" AS ENUM (
    'referral_partner',
    'potential_customer'
);

CREATE TYPE "public"."marital_status_type" AS ENUM (
    'Single',
    'Married',
    'Divorced',
    'Widowed'
);

CREATE TYPE "public"."parental_status_type" AS ENUM (
    'Has children',
    'No children'
);

CREATE TYPE "public"."payment_destination_type" AS ENUM (
    'facility',
    'patient'
);

CREATE TYPE "public"."user_phone_status_enum" AS ENUM (
    'available',
    'busy',
    'unavailable',
    'wrap-up',
    'away',
    'offline'
);

CREATE TYPE "public"."user_role" AS ENUM (
    'lead',
    'customer',
    'agent',
    'admin',
    'super_admin'
);

-- Custom Functions (Add definitions here, before tables that use triggers)
CREATE OR REPLACE FUNCTION "public"."handle_soft_delete_communications"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE communications
    SET deleted_at = NOW()
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_soft_delete_message_templates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE message_templates
    SET deleted_at = NOW()
    WHERE id = OLD.id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_vob_versioning"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get the latest version number for this user
        SELECT COALESCE(MAX(version), 0) + 1
        INTO NEW.version
        FROM vob_records
        WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."refresh_user_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Try to refresh concurrently, if it fails (due to concurrent usage), do nothing
    -- The view will be refreshed by the next trigger event
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't fail the transaction
        RAISE NOTICE 'Could not refresh user_roles view: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."validate_user_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- For leads and customers, ensure they don't have auth accounts
    IF NEW.role IN ('lead', 'customer') THEN
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Leads and customers cannot have auth accounts';
        END IF;
    -- For application users, ensure they have auth accounts
    ELSIF NEW.role IN ('agent', 'admin', 'super_admin') THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Agents, admins, and super admins must have auth accounts';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_companies_with_count"("p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_type" "text" DEFAULT NULL::"text", "p_neighborhood" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0, "p_sort_field" "text" DEFAULT 'created_at'::"text", "p_sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("companies" "json", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH filtered_companies AS (
        SELECT c.*
        FROM companies c
        WHERE (c.deleted_at IS NULL)
        AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
        AND (p_type IS NULL OR c.type = p_type)
        AND (p_neighborhood IS NULL OR c.neighborhood = p_neighborhood)
        AND (
            p_search IS NULL OR
            c.name ILIKE '%' || p_search || '%' OR
            c.type ILIKE '%' || p_search || '%' OR
            COALESCE(c.street_address, '') ILIKE '%' || p_search || '%' OR
            COALESCE(c.city, '') ILIKE '%' || p_search || '%'
        )
    )
    SELECT
        COALESCE(
            (
                SELECT json_agg(t)
                FROM (
                    SELECT *
                    FROM filtered_companies
                    ORDER BY
                        CASE
                            WHEN p_sort_field = 'name' AND p_sort_order = 'asc' THEN name END ASC,
                        CASE
                            WHEN p_sort_field = 'name' AND p_sort_order = 'desc' THEN name END DESC,
                        CASE
                            WHEN p_sort_field = 'type' AND p_sort_order = 'asc' THEN type END ASC,
                        CASE
                            WHEN p_sort_field = 'type' AND p_sort_order = 'desc' THEN type END DESC,
                        CASE
                            WHEN p_sort_field = 'created_at' AND p_sort_order = 'asc' THEN created_at END ASC,
                        CASE
                            WHEN p_sort_field = 'created_at' AND p_sort_order = 'desc' OR p_sort_field IS NULL THEN created_at END DESC
                    LIMIT p_limit
                    OFFSET p_offset
                ) t
            ),
            '[]'::json
        ) AS companies,
        COUNT(*) OVER() AS total_count
    FROM filtered_companies
    LIMIT 1;
END;
$$;

--
-- Table: organizations
--
create table public.organizations (
  id uuid not null default gen_random_uuid (),
  name text not null,
  slug text not null,
  plan text not null default 'free'::text,
  subscription_status text not null default 'active'::text,
  subscription_period_start timestamp with time zone null,
  subscription_period_end timestamp with time zone null,
  max_users integer not null default 5,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  constraint organizations_pkey primary key (id),
  constraint organizations_slug_key unique (slug)
) TABLESPACE pg_default;

create index IF not exists idx_organizations_deleted_at on public.organizations using btree (deleted_at) TABLESPACE pg_default;
create index IF not exists idx_organizations_slug on public.organizations using btree (slug) TABLESPACE pg_default;

--
-- Table: user_groups
--
-- Note: Assumes function (update_updated_at_column) is defined earlier in this file.
create table public.user_groups (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  description text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  twilio_phone text null,
  constraint user_groups_pkey primary key (id),
  constraint user_groups_twilio_number_key unique (twilio_phone)
) TABLESPACE pg_default;

create trigger update_user_groups_updated_at BEFORE
update on user_groups for EACH row
execute FUNCTION update_updated_at_column ();

--
-- Table: companies
--
-- Note: Assumes table (organizations) is defined earlier in this file or in Supabase pre-defined setup.
-- Note: Requires the pg_trgm extension to be enabled (e.g., CREATE EXTENSION IF NOT EXISTS pg_trgm;)
create table public.companies (
  created_at timestamp with time zone not null default now(),
  name text null,
  type text null,
  id uuid not null default gen_random_uuid (),
  deleted_at timestamp with time zone null,
  street_address text null,
  neighborhood text null,
  city text null,
  state text null,
  postal_code text null,
  country text null,
  organization_id uuid null,
  notes text null,
  website text null,
  description text null,
  constraint companies_pkey primary key (id),
  constraint companies_new_id_key unique (id),
  constraint companies_organization_id_fkey foreign KEY (organization_id) references organizations (id)
) TABLESPACE pg_default;

create index IF not exists idx_companies_address_trgm on public.companies using gin (street_address gin_trgm_ops) TABLESPACE pg_default;
create index IF not exists idx_companies_city_trgm on public.companies using gin (city gin_trgm_ops) TABLESPACE pg_default;
create index IF not exists idx_companies_filters on public.companies using btree (organization_id, type, neighborhood, deleted_at) TABLESPACE pg_default;
create index IF not exists idx_companies_name_trgm on public.companies using gin (name gin_trgm_ops) TABLESPACE pg_default;
create index IF not exists idx_companies_organization_id on public.companies using btree (organization_id) TABLESPACE pg_default;
create index IF not exists idx_companies_sort_created on public.companies using btree (created_at desc nulls last) TABLESPACE pg_default;
create index IF not exists idx_companies_sort_name on public.companies using btree (name) TABLESPACE pg_default;
create index IF not exists idx_companies_sort_type on public.companies using btree (type) TABLESPACE pg_default;
create index IF not exists idx_companies_type_trgm on public.companies using gin (type gin_trgm_ops) TABLESPACE pg_default;

--
-- Table: follow_up_sequences
--
-- Note: Assumes custom type (follow_up_sequence_type) is defined earlier 
-- in this file or in Supabase pre-defined setup.
create table public.follow_up_sequences (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone null default now(),
  name text not null,
  type public.follow_up_sequence_type not null,
  is_infinite boolean null default false,
  interval_days integer not null,
  sequence_order integer not null,
  constraint follow_up_sequences_pkey primary key (id),
  constraint follow_up_sequences_type_sequence_order_key unique (type, sequence_order)
) TABLESPACE pg_default;

--
-- Table: users
--
-- Note: Assumes custom types (user_role, follow_up_sequence_type, lead_type) and functions (refresh_user_roles, validate_user_auth) 
-- are defined earlier in this file or in Supabase pre-defined setup.
-- References tables (organizations, companies) which should be defined earlier.
create table public.users (
  created_at timestamp with time zone not null default now(),
  role public.user_role not null default 'lead'::user_role,
  phone text null,
  email text null,
  first_name text null,
  last_name text null,
  status text null default 'active'::text,
  lost_at timestamp with time zone null,
  lost_reason text null,
  company text null,
  notes text null,
  deleted_at timestamp with time zone null,
  updated_at timestamp with time zone null,
  id uuid not null default gen_random_uuid (),
  owner_id uuid null,
  address_line1 text null,
  address_line2 text null,
  state_province text null,
  company_id uuid null,
  position text null,
  organization_id uuid null,
  sequence_type public.follow_up_sequence_type null,
  sequence_position integer null default 0,
  won_at timestamp with time zone null,
  won_by uuid null,
  created_by uuid null,
  linkedin text null,
  lead_type public.lead_type null,
  lead_source text null,
  referrer_id uuid null,
  twilio_phone text null,
  constraint users_pkey primary key (id),
  constraint users_new_id_key unique (id),
  constraint users_organization_id_fkey foreign KEY (organization_id) references organizations (id),
  constraint users_owner_id_fkey foreign KEY (owner_id) references users (id),
  constraint users_referrer_id_fkey foreign KEY (referrer_id) references users (id) on update CASCADE on delete set null,
  constraint users_won_by_fkey foreign KEY (won_by) references users (id),
  constraint users_created_by_fkey foreign KEY (created_by) references users (id),
  constraint users_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint users_status_check check (
    (
      status = any (
        array[
          'needs_response'::text,
          'new'::text,
          'follow_up'::text,
          'unresponsive'::text,
          'won'::text,
          'lost'::text,
          null::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_users_organization_id on public.users using btree (organization_id) TABLESPACE pg_default;

create trigger refresh_user_roles_trigger
after INSERT
or DELETE
or
update on users for EACH STATEMENT
execute FUNCTION refresh_user_roles ();

create trigger validate_user_auth_trigger BEFORE INSERT
or
update on users for EACH row
execute FUNCTION validate_user_auth ();

--
-- Table: calls (Correct definition)
--
-- Note: Assumes function (update_updated_at_column) is defined earlier in this file or in Supabase pre-defined setup.
create table public.calls (
  id uuid not null default extensions.uuid_generate_v4 (),
  to_user_id uuid null,
  from_number text not null,
  to_number text not null,
  status text not null,
  duration integer null default 0,
  recording_url text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  call_sid text null,
  started_at timestamp with time zone null,
  from_user_id uuid null,
  group_id uuid null,
  ended_at timestamp with time zone null,
  direction text null,
  constraint calls_pkey primary key (id),
  constraint calls_call_sid_key unique (call_sid),
  constraint calls_from_user_id_fkey foreign KEY (from_user_id) references users (id),
  constraint calls_group_id_fkey foreign KEY (group_id) references user_groups (id)
) TABLESPACE pg_default;

create index IF not exists calls_call_sid_idx on public.calls using btree (call_sid) TABLESPACE pg_default;
create index IF not exists calls_from_user_id_idx on public.calls using btree (from_user_id) TABLESPACE pg_default;
create index IF not exists calls_group_id_idx on public.calls using btree (group_id) TABLESPACE pg_default;
create index IF not exists calls_to_user_id_idx on public.calls using btree (to_user_id) TABLESPACE pg_default;
-- Note: idx_calls_call_sid seems redundant given calls_call_sid_idx and the unique constraint, keeping user provided index
create index IF not exists idx_calls_call_sid on public.calls using btree (call_sid) TABLESPACE pg_default;

create trigger update_calls_updated_at BEFORE
update on calls for EACH row
execute FUNCTION update_updated_at_column ();

--
-- Table: b2c_lead_info
--
-- Note: Assumes custom types (gender_type, marital_status_type, parental_status_type)
-- and function (update_updated_at_column) are defined earlier in this file or in Supabase pre-defined setup.
create table public.b2c_lead_info (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  address text not null,
  gender public.gender_type not null,
  ssn_last_four character(4) not null,
  marital_status public.marital_status_type not null,
  parental_status public.parental_status_type not null,
  referral_source text not null,
  headshot_url text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid not null,
  updated_by uuid not null,
  dob date null,
  constraint b2c_lead_info_pkey primary key (id),
  constraint b2c_lead_info_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint b2c_lead_info_updated_by_fkey foreign KEY (updated_by) references auth.users (id),
  constraint b2c_lead_info_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger update_b2c_lead_info_updated_at BEFORE
update on b2c_lead_info for EACH row
execute FUNCTION update_updated_at_column ();

--
-- Table: communications
--
-- Note: Assumes function (handle_soft_delete_communications) and table (users) 
-- are defined earlier in this file or in Supabase pre-defined setup.
create table public.communications (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  communication_type text null,
  direction text null,
  from_address text null,
  to_address text null,
  content text null,
  delivered_at timestamp with time zone null,
  agent_id uuid null,
  user_id uuid null,
  deleted_at timestamp with time zone null,
  communication_type_id uuid null,
  constraint communications_pkey primary key (id),
  constraint communications_agent_id_fkey foreign KEY (agent_id) references users (id)
) TABLESPACE pg_default;

create trigger soft_delete_communications BEFORE DELETE on communications for EACH row
execute FUNCTION handle_soft_delete_communications ();

--
-- Table: email_integrations
--
-- Note: Assumes table (users) and function (handle_updated_at) are defined earlier 
-- in this file or in Supabase pre-defined setup.
create table public.email_integrations (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  provider character varying not null,
  refresh_token text not null,
  access_token text null,
  token_expires_at timestamp with time zone null,
  email character varying not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  deleted_at timestamp with time zone null,
  constraint email_integrations_pkey primary key (id),
  constraint email_integrations_user_provider_email_unique unique NULLS not distinct (user_id, provider, email, deleted_at),
  constraint email_integrations_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint email_integrations_provider_check check (
    (
      (provider)::text = any (
        array[
          ('gmail'::character varying)::text,
          ('outlook'::character varying)::text
        ]
      )
    )
  ),
  constraint refresh_token_not_empty check ((length(refresh_token) > 0))
) TABLESPACE pg_default;

create index IF not exists email_integrations_active_idx on public.email_integrations using btree (user_id, provider, email) TABLESPACE pg_default
where
  (deleted_at is null);

create index IF not exists email_integrations_email_idx on public.email_integrations using btree (email) TABLESPACE pg_default;
create index IF not exists email_integrations_provider_idx on public.email_integrations using btree (provider) TABLESPACE pg_default;
create index IF not exists email_integrations_user_id_idx on public.email_integrations using btree (user_id) TABLESPACE pg_default;

create trigger handle_email_integrations_updated_at BEFORE
update on email_integrations for EACH row
execute FUNCTION handle_updated_at ();

--
-- Table: follow_ups
--
create table public.follow_ups (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone null default now(),
  date timestamp with time zone not null,
  type text not null,
  completed boolean null default false,
  next_follow_up_id uuid null,
  notes text null,
  user_id uuid null,
  updated_at timestamp with time zone null,
  deleted_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  constraint follow_ups_pkey primary key (id),
  constraint follow_ups_next_follow_up_id_fkey foreign KEY (next_follow_up_id) references follow_ups (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists follow_ups_complete_idx on public.follow_ups using btree (completed) TABLESPACE pg_default;
create index IF not exists follow_ups_date_idx on public.follow_ups using btree (date) TABLESPACE pg_default;
create index IF not exists idx_follow_ups_next_follow_up_id on public.follow_ups using btree (next_follow_up_id) TABLESPACE pg_default;

--
-- Table: group_memberships
--
-- Note: Assumes table (user_groups) is defined earlier in this file.
-- References auth.users which is handled by Supabase auth.
create table public.group_memberships (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  group_id uuid not null,
  is_admin boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint group_memberships_pkey primary key (id),
  constraint group_memberships_user_id_group_id_key unique (user_id, group_id),
  constraint group_memberships_group_id_fkey foreign KEY (group_id) references user_groups (id) on delete CASCADE,
  constraint group_memberships_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

--
-- Table: integrations
--
-- Note: Assumes table (users) and function (handle_updated_at) are defined earlier
-- in this file or in Supabase pre-defined setup.
create table public.integrations (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  provider character varying not null,
  type character varying not null,
  credentials jsonb null default '{}'::jsonb,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  deleted_at timestamp with time zone null,
  constraint integrations_pkey primary key (id),
  constraint integrations_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint integrations_type_check check (
    (
      (type)::text = any (
        array[
          ('phone'::character varying)::text,
          ('sms'::character varying)::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists integrations_provider_idx on public.integrations using btree (provider) TABLESPACE pg_default;
create index IF not exists integrations_type_idx on public.integrations using btree (type) TABLESPACE pg_default;
create index IF not exists integrations_user_id_idx on public.integrations using btree (user_id) TABLESPACE pg_default;

create trigger handle_integrations_updated_at BEFORE
update on integrations for EACH row
execute FUNCTION handle_updated_at ();

--
-- Table: message_templates
--
-- Note: Assumes table (organizations) and function (handle_soft_delete_message_templates)
-- are defined earlier in this file or in Supabase pre-defined setup.
-- References auth.users which is handled by Supabase auth.
create table public.message_templates (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  name text not null,
  content text not null,
  created_by uuid not null,
  organization_id uuid not null,
  deleted_at timestamp with time zone null,
  constraint message_templates_pkey primary key (id),
  constraint message_templates_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint message_templates_organization_id_fkey foreign KEY (organization_id) references organizations (id)
) TABLESPACE pg_default;

create index IF not exists message_templates_created_at_idx on public.message_templates using btree (created_at) TABLESPACE pg_default;
create index IF not exists message_templates_created_by_idx on public.message_templates using btree (created_by) TABLESPACE pg_default;
create index IF not exists message_templates_organization_id_idx on public.message_templates using btree (organization_id) TABLESPACE pg_default;

create trigger soft_delete_message_templates BEFORE DELETE on message_templates for EACH row
execute FUNCTION handle_soft_delete_message_templates ();

--
-- Table: user_phone_status
--
-- Note: Assumes custom type (user_phone_status_enum) and function (update_updated_at_column) 
-- are defined earlier in this file or in Supabase pre-defined setup.
-- References auth.users which is handled by Supabase auth.
create table public.user_phone_status (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid null,
  status public.user_phone_status_enum not null default 'available'::user_phone_status_enum,
  last_updated timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint user_phone_status_pkey primary key (id),
  constraint user_phone_status_user_id_key unique (user_id),
  constraint user_phone_status_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create trigger update_user_phone_status_last_updated BEFORE
update on user_phone_status for EACH row
execute FUNCTION update_updated_at_column ();

create trigger update_user_phone_status_updated_at BEFORE
update on user_phone_status for EACH row
execute FUNCTION update_updated_at_column ();

--
-- Table: vob_records
--
-- Note: Assumes table (users), custom type (payment_destination_type),
-- and functions (update_updated_at_column, handle_vob_versioning) are defined earlier.
-- References auth.users which is handled by Supabase auth.
create table public.vob_records (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  version integer not null default 1,
  verified_by uuid not null,
  created_date timestamp with time zone not null default now(),
  reference_id text not null,
  rep_spoke_to text not null,
  relationship_to_subscriber text not null,
  dependent_ages text null,
  subscriber_address text not null,
  cob_info text null,
  plan_type text not null,
  policy_type text not null,
  subscriber_name text not null,
  plan_year text not null,
  funding_type text not null,
  effective_date date not null,
  termination_date date null,
  payment_destination public.payment_destination_type not null,
  deductible numeric(10, 2) null,
  deductible_met numeric(10, 2) null,
  out_of_pocket numeric(10, 2) null,
  out_of_pocket_met numeric(10, 2) null,
  coinsurance integer null,
  copay numeric(10, 2) null,
  deductible_applies_to_oop boolean null default false,
  cross_accumulate boolean null default false,
  op_coverage boolean null default false,
  iop_coverage boolean null default false,
  telehealth_coverage boolean null default false,
  reimbursement_type text null,
  multi_plan boolean null default false,
  notes text null,
  preauth_reference_number text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint vob_records_pkey primary key (id),
  constraint vob_records_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint vob_records_verified_by_fkey foreign KEY (verified_by) references auth.users (id)
) TABLESPACE pg_default;

create trigger update_vob_records_updated_at BEFORE
update on vob_records for EACH row
execute FUNCTION update_updated_at_column ();

create trigger vob_versioning_trigger BEFORE INSERT on vob_records for EACH row
execute FUNCTION handle_vob_versioning ();

--
-- Table: vob_covered_codes
--
-- Note: Assumes table (vob_records) is defined earlier in this file.
create table public.vob_covered_codes (
  id uuid not null default extensions.uuid_generate_v4 (),
  vob_record_id uuid not null,
  code integer not null,
  description text not null,
  covered_for_telehealth boolean null default false,
  authorization_required boolean null default false,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  constraint vob_covered_codes_pkey primary key (id),
  constraint vob_covered_codes_vob_record_id_fkey foreign KEY (vob_record_id) references vob_records (id) on delete CASCADE
) TABLESPACE pg_default;

-- Materialized Views (Define after all tables)
create materialized view public.user_roles as
select
  users.id,
  users.role,
  users.organization_id,
  users.deleted_at
from
  users; 