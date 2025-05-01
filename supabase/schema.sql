

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."follow_up_sequence_type" AS ENUM (
    'lead',
    'customer'
);


ALTER TYPE "public"."follow_up_sequence_type" OWNER TO "postgres";


CREATE TYPE "public"."follow_up_type" AS ENUM (
    'email',
    'sms',
    'call',
    'meeting',
    'tour'
);


ALTER TYPE "public"."follow_up_type" OWNER TO "postgres";


CREATE TYPE "public"."gender_type" AS ENUM (
    'Male',
    'Female',
    'Non-binary',
    'Other',
    'Prefer not to say'
);


ALTER TYPE "public"."gender_type" OWNER TO "postgres";


CREATE TYPE "public"."lead_type" AS ENUM (
    'referral_partner',
    'potential_customer'
);


ALTER TYPE "public"."lead_type" OWNER TO "postgres";


CREATE TYPE "public"."marital_status_type" AS ENUM (
    'Single',
    'Married',
    'Divorced',
    'Widowed'
);


ALTER TYPE "public"."marital_status_type" OWNER TO "postgres";


CREATE TYPE "public"."parental_status_type" AS ENUM (
    'Has children',
    'No children'
);


ALTER TYPE "public"."parental_status_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_destination_type" AS ENUM (
    'facility',
    'patient'
);


ALTER TYPE "public"."payment_destination_type" OWNER TO "postgres";


CREATE TYPE "public"."user_phone_status_enum" AS ENUM (
    'available',
    'busy',
    'unavailable',
    'wrap-up',
    'away',
    'offline'
);


ALTER TYPE "public"."user_phone_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'lead',
    'customer',
    'agent',
    'admin',
    'super_admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_company_permission"("company_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.deleted_at IS NULL
        AND (
            users.role = 'super_admin'
            OR (
                users.role IN ('admin', 'agent')
                AND users.organization_id = (
                    SELECT organization_id 
                    FROM companies 
                    WHERE id = company_id
                )
            )
        )
    );
END;
$$;


ALTER FUNCTION "public"."check_company_permission"("company_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "public"."user_role" DEFAULT 'lead'::"public"."user_role" NOT NULL,
    "phone" "text",
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "lost_at" timestamp with time zone,
    "lost_reason" "text",
    "company" "text",
    "notes" "text",
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "address_line1" "text",
    "address_line2" "text",
    "state_province" "text",
    "company_id" "uuid",
    "position" "text",
    "organization_id" "uuid",
    "sequence_type" "public"."follow_up_sequence_type",
    "sequence_position" integer DEFAULT 0,
    "won_at" timestamp with time zone,
    "won_by" "uuid",
    "created_by" "uuid",
    "linkedin" "text",
    "lead_type" "public"."lead_type",
    "lead_source" "text",
    "referrer_id" "uuid",
    "twilio_phone" "text",
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['needs_response'::"text", 'new'::"text", 'follow_up'::"text", 'unresponsive'::"text", 'won'::"text", 'lost'::"text", NULL::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."linkedin" IS 'url';



CREATE OR REPLACE FUNCTION "public"."create_user"("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "company_id" "uuid", "notes" "text", "user_role" "text", "owner_id" "uuid", "user_status" "text" DEFAULT NULL::"text") RETURNS "public"."users"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    creating_user_org_id uuid;
    creating_user_role text;
    new_user users;
BEGIN
    -- Get the creating user's context
    SELECT organization_id, role INTO creating_user_org_id, creating_user_role
    FROM users
    WHERE id = auth.uid();

    -- Check if the creating user has permission
    IF creating_user_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Only admins and super admins can create users';
    END IF;

    -- For regular admins, ensure they can only create users in their org
    IF creating_user_role = 'admin' AND creating_user_org_id IS NOT NULL THEN
        -- Insert the new user with the admin's organization
        INSERT INTO users (
            id,
            first_name,
            last_name,
            email,
            phone,
            company_id,
            notes,
            role,
            status,
            owner_id,
            organization_id,
            created_at,
            updated_at
        ) VALUES (
            user_id,
            first_name,
            last_name,
            email,
            phone,
            company_id,
            notes,
            text_to_user_role(user_role),
            COALESCE(user_status, CASE WHEN user_role = 'lead' THEN 'new' WHEN user_role = 'customer' THEN 'won' ELSE NULL END),
            owner_id,
            creating_user_org_id,
            NOW(),
            NOW()
        )
        RETURNING * INTO new_user;
    -- For super admins, allow creating users in any org
    ELSIF creating_user_role = 'super_admin' THEN
        INSERT INTO users (
            id,
            first_name,
            last_name,
            email,
            phone,
            company_id,
            notes,
            role,
            status,
            owner_id,
            organization_id,
            created_at,
            updated_at
        ) VALUES (
            user_id,
            first_name,
            last_name,
            email,
            phone,
            company_id,
            notes,
            text_to_user_role(user_role),
            COALESCE(user_status, CASE WHEN user_role = 'lead' THEN 'new' WHEN user_role = 'customer' THEN 'won' ELSE NULL END),
            owner_id,
            creating_user_org_id, -- Super admin's org by default, can be changed later
            NOW(),
            NOW()
        )
        RETURNING * INTO new_user;
    ELSE
        RAISE EXCEPTION 'Invalid user role or organization context';
    END IF;

    RETURN new_user;
END;
$$;


ALTER FUNCTION "public"."create_user"("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "company_id" "uuid", "notes" "text", "user_role" "text", "owner_id" "uuid", "user_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_next_follow_up"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_last_follow_up_date TIMESTAMPTZ;
    v_next_date TIMESTAMPTZ;
    v_new_follow_up_id UUID;
    v_sequence_type follow_up_sequence_type;
BEGIN
    -- Get user's sequence type
    SELECT sequence_type
    INTO v_sequence_type
    FROM users
    WHERE id = p_user_id;

    -- Get the last follow up date
    SELECT date
    INTO v_last_follow_up_date
    FROM follow_ups
    WHERE user_id = p_user_id
    AND deleted_at IS NULL
    ORDER BY date DESC
    LIMIT 1;

    -- If no last follow up, use current date
    IF v_last_follow_up_date IS NULL THEN
        v_last_follow_up_date := NOW();
    END IF;

    -- Get next follow up date
    v_next_date := get_next_follow_up_date(p_user_id, v_last_follow_up_date);

    -- If no next date, return null
    IF v_next_date IS NULL THEN
        RETURN NULL;
    END IF;

    -- Create new follow up
    INSERT INTO follow_ups (
        user_id,
        date,
        type,
        completed
    )
    VALUES (
        p_user_id,
        v_next_date,
        'email',
        false
    )
    RETURNING id INTO v_new_follow_up_id;

    -- Update user's sequence position for non-infinite sequences
    UPDATE users
    SET sequence_position = sequence_position + 1
    WHERE id = p_user_id
    AND sequence_type = 'lead'; -- Only increment for lead sequence

    RETURN v_new_follow_up_id;
END;
$$;


ALTER FUNCTION "public"."generate_next_follow_up"("p_user_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."get_companies_with_count"("p_organization_id" "uuid", "p_type" "text", "p_neighborhood" "text", "p_search" "text", "p_limit" integer, "p_offset" integer, "p_sort_field" "text", "p_sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_follow_up_date"("p_user_id" "uuid", "p_current_date" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_sequence_type follow_up_sequence_type;
    v_sequence_position INTEGER;
    v_interval_days INTEGER;
    v_is_infinite BOOLEAN;
BEGIN
    -- Get user's current sequence info
    SELECT sequence_type, sequence_position
    INTO v_sequence_type, v_sequence_position
    FROM users
    WHERE id = p_user_id;

    -- Get next interval from sequence
    SELECT interval_days, is_infinite
    INTO v_interval_days, v_is_infinite
    FROM follow_up_sequences
    WHERE type = v_sequence_type
    AND (
        -- For non-infinite sequences, get exact position
        (NOT is_infinite AND sequence_order = v_sequence_position + 1)
        OR 
        -- For infinite sequences, get the single interval
        (is_infinite AND sequence_order = 1)
    );

    -- Return NULL if no valid interval found
    IF v_interval_days IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN p_current_date + (v_interval_days || ' days')::INTERVAL;
END;
$$;


ALTER FUNCTION "public"."get_next_follow_up_date"("p_user_id" "uuid", "p_current_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_context"("user_id" "uuid") RETURNS TABLE("organization_id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT organization_id, role
    FROM users
    WHERE id = user_id;
$$;


ALTER FUNCTION "public"."get_user_context"("user_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."handle_soft_delete_communications"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."handle_soft_delete_message_templates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."handle_vob_versioning"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."refresh_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."text_to_user_role"("role_text" "text") RETURNS "public"."user_role"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    RETURN role_text::user_role;
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid user role: %. Must be one of: lead, customer, agent, admin, super_admin', role_text;
END;
$$;


ALTER FUNCTION "public"."text_to_user_role"("role_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_to_customer"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Update user's sequence info
    UPDATE users
    SET 
        role = 'customer',
        sequence_type = 'customer',
        sequence_position = 0,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Mark all existing incomplete follow-ups as completed
    UPDATE follow_ups
    SET 
        completed = true,
        completed_at = NOW()
    WHERE 
        user_id = p_user_id
        AND completed = false
        AND deleted_at IS NULL;

    -- Generate first customer follow-up
    PERFORM generate_next_follow_up(p_user_id);
END;
$$;


ALTER FUNCTION "public"."transition_to_customer"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_statuses_and_generate_follow_ups"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_record RECORD;
  v_look_ahead_days INTEGER := 30;
  v_last_follow_up_date TIMESTAMPTZ;
  v_next_follow_up_date TIMESTAMPTZ;
BEGIN
  -- Update user statuses (existing logic)
  UPDATE users
  SET 
    status = 'follow_up',
    updated_at = NOW()
  FROM follow_ups
  WHERE 
    users.id = follow_ups.user_id
    AND follow_ups.completed = false
    AND follow_ups.deleted_at IS NULL
    AND DATE(follow_ups.date) = CURRENT_DATE
    AND users.deleted_at IS NULL
    AND users.role = 'lead'
    AND users.status != 'lost'
    AND users.status != 'won';

  -- Generate follow-ups for users who need them
  FOR v_user_record IN 
    SELECT DISTINCT u.id, u.role, u.created_at
    FROM users u
    WHERE u.deleted_at IS NULL
    AND u.role IN ('lead', 'customer')
    AND u.status != 'lost'
    AND (
      -- For leads, only generate if they have no follow-ups
      (u.role = 'lead' AND NOT EXISTS (
        SELECT 1 FROM follow_ups f 
        WHERE f.user_id = u.id 
        AND f.deleted_at IS NULL
      ))
      OR
      -- For customers, generate if their last follow-up is within the look-ahead window
      (u.role = 'customer' AND (
        NOT EXISTS (
          SELECT 1 FROM follow_ups f 
          WHERE f.user_id = u.id 
          AND f.deleted_at IS NULL
        )
        OR
        (SELECT MAX(date) FROM follow_ups 
         WHERE user_id = u.id 
         AND deleted_at IS NULL) < NOW() + (v_look_ahead_days || ' days')::INTERVAL
      ))
    )
  LOOP
    -- Get the last follow-up date for this user
    SELECT MAX(date)
    INTO v_last_follow_up_date
    FROM follow_ups
    WHERE user_id = v_user_record.id
    AND deleted_at IS NULL;

    -- If no last follow-up, use created_at date
    IF v_last_follow_up_date IS NULL THEN
      v_last_follow_up_date := v_user_record.created_at;
    END IF;

    -- For customers, create next weekly follow-up
    IF v_user_record.role = 'customer' THEN
      -- Calculate next follow-up date (7 days after last follow-up)
      v_next_follow_up_date := v_last_follow_up_date + '7 days'::INTERVAL;
      
      -- Only create if it's within our look-ahead window
      IF v_next_follow_up_date < NOW() + (v_look_ahead_days || ' days')::INTERVAL THEN
        INSERT INTO follow_ups (
          user_id,
          date,
          type,
          completed
        ) VALUES (
          v_user_record.id,
          v_next_follow_up_date,
          'email',
          false
        );
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'User status update and follow-up generation completed at %', NOW();
END;
$$;


ALTER FUNCTION "public"."update_user_statuses_and_generate_follow_ups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_statuses_for_followups"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update users to 'follow_up' status if they have incomplete follow-ups today
  UPDATE users
  SET 
    status = 'follow_up',
    updated_at = NOW()
  FROM follow_ups
  WHERE 
    users.id = follow_ups.user_id
    AND follow_ups.completed = false
    AND follow_ups.deleted_at IS NULL
    AND DATE(follow_ups.date) = CURRENT_DATE
    AND users.deleted_at IS NULL
    AND users.role = 'lead'
    AND users.status != 'lost'
    AND users.status != 'won';

  -- Log that the job ran
  RAISE NOTICE 'User status update job completed at %', NOW();
END;
$$;


ALTER FUNCTION "public"."update_user_statuses_for_followups"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."validate_user_auth"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."b2c_lead_info" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "address" "text" NOT NULL,
    "gender" "public"."gender_type" NOT NULL,
    "ssn_last_four" character(4) NOT NULL,
    "marital_status" "public"."marital_status_type" NOT NULL,
    "parental_status" "public"."parental_status_type" NOT NULL,
    "referral_source" "text" NOT NULL,
    "headshot_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "dob" "date"
);


ALTER TABLE "public"."b2c_lead_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "to_user_id" "uuid",
    "from_number" "text" NOT NULL,
    "to_number" "text" NOT NULL,
    "status" "text" NOT NULL,
    "duration" integer DEFAULT 0,
    "recording_url" "text",
    "communication_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "call_sid" "text",
    "started_at" timestamp with time zone,
    "from_user_id" "uuid",
    "group_id" "uuid"
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


COMMENT ON COLUMN "public"."calls"."call_sid" IS 'The Twilio Call SID for this call';



CREATE TABLE IF NOT EXISTS "public"."communications" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "communication_type" "text",
    "direction" "text",
    "from_address" "text",
    "to_address" "text",
    "content" "text",
    "delivered_at" timestamp with time zone,
    "agent_id" "uuid",
    "user_id" "uuid",
    "deleted_at" timestamp with time zone,
    "communication_type_id" "uuid"
);


ALTER TABLE "public"."communications" OWNER TO "postgres";


ALTER TABLE "public"."communications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."communications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."companies" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "type" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "street_address" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "country" "text",
    "organization_id" "uuid",
    "notes" "text",
    "website" "text",
    "description" "text"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_integrations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" character varying NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "token_expires_at" timestamp with time zone,
    "email" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "email_integrations_provider_check" CHECK ((("provider")::"text" = ANY (ARRAY[('gmail'::character varying)::"text", ('outlook'::character varying)::"text"]))),
    CONSTRAINT "refresh_token_not_empty" CHECK (("length"("refresh_token") > 0))
);


ALTER TABLE "public"."email_integrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_integrations" IS 'Stores email integration settings for users';



CREATE TABLE IF NOT EXISTS "public"."follow_up_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "type" "public"."follow_up_sequence_type" NOT NULL,
    "is_infinite" boolean DEFAULT false,
    "interval_days" integer NOT NULL,
    "sequence_order" integer NOT NULL
);


ALTER TABLE "public"."follow_up_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date" timestamp with time zone NOT NULL,
    "type" "text" NOT NULL,
    "completed" boolean DEFAULT false,
    "next_follow_up_id" "uuid",
    "notes" "text",
    "user_id" "uuid",
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."follow_ups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_memberships" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "is_admin" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."group_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" character varying NOT NULL,
    "type" character varying NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "integrations_type_check" CHECK ((("type")::"text" = ANY (ARRAY[('phone'::character varying)::"text", ('sms'::character varying)::"text"])))
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."integrations" IS 'Stores phone and SMS integration settings for users';



CREATE TABLE IF NOT EXISTS "public"."message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "subscription_period_start" timestamp with time zone,
    "subscription_period_end" timestamp with time zone,
    "max_users" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "twilio_phone" "text"
);


ALTER TABLE "public"."user_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_phone_status" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "status" "public"."user_phone_status_enum" DEFAULT 'available'::"public"."user_phone_status_enum" NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_phone_status" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."user_roles" AS
 SELECT "users"."id",
    "users"."role",
    "users"."organization_id",
    "users"."deleted_at"
   FROM "public"."users"
  WITH NO DATA;


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vob_covered_codes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "vob_record_id" "uuid" NOT NULL,
    "code" integer NOT NULL,
    "description" "text" NOT NULL,
    "covered_for_telehealth" boolean DEFAULT false,
    "authorization_required" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."vob_covered_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vob_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "verified_by" "uuid" NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference_id" "text" NOT NULL,
    "rep_spoke_to" "text" NOT NULL,
    "relationship_to_subscriber" "text" NOT NULL,
    "dependent_ages" "text",
    "subscriber_address" "text" NOT NULL,
    "cob_info" "text",
    "plan_type" "text" NOT NULL,
    "policy_type" "text" NOT NULL,
    "subscriber_name" "text" NOT NULL,
    "plan_year" "text" NOT NULL,
    "funding_type" "text" NOT NULL,
    "effective_date" "date" NOT NULL,
    "termination_date" "date",
    "payment_destination" "public"."payment_destination_type" NOT NULL,
    "deductible" numeric(10,2),
    "deductible_met" numeric(10,2),
    "out_of_pocket" numeric(10,2),
    "out_of_pocket_met" numeric(10,2),
    "coinsurance" integer,
    "copay" numeric(10,2),
    "deductible_applies_to_oop" boolean DEFAULT false,
    "cross_accumulate" boolean DEFAULT false,
    "op_coverage" boolean DEFAULT false,
    "iop_coverage" boolean DEFAULT false,
    "telehealth_coverage" boolean DEFAULT false,
    "reimbursement_type" "text",
    "multi_plan" boolean DEFAULT false,
    "notes" "text",
    "preauth_reference_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vob_records" OWNER TO "postgres";


ALTER TABLE ONLY "public"."b2c_lead_info"
    ADD CONSTRAINT "b2c_lead_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_call_sid_key" UNIQUE ("call_sid");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communications"
    ADD CONSTRAINT "communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_new_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_integrations"
    ADD CONSTRAINT "email_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_integrations"
    ADD CONSTRAINT "email_integrations_user_provider_email_unique" UNIQUE NULLS NOT DISTINCT ("user_id", "provider", "email", "deleted_at");



ALTER TABLE ONLY "public"."follow_up_sequences"
    ADD CONSTRAINT "follow_up_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_up_sequences"
    ADD CONSTRAINT "follow_up_sequences_type_sequence_order_key" UNIQUE ("type", "sequence_order");



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_user_id_group_id_key" UNIQUE ("user_id", "group_id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_groups"
    ADD CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_groups"
    ADD CONSTRAINT "user_groups_twilio_number_key" UNIQUE ("twilio_phone");



ALTER TABLE ONLY "public"."user_phone_status"
    ADD CONSTRAINT "user_phone_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_phone_status"
    ADD CONSTRAINT "user_phone_status_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_new_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vob_covered_codes"
    ADD CONSTRAINT "vob_covered_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vob_records"
    ADD CONSTRAINT "vob_records_pkey" PRIMARY KEY ("id");



CREATE INDEX "calls_call_sid_idx" ON "public"."calls" USING "btree" ("call_sid");



CREATE INDEX "calls_from_user_id_idx" ON "public"."calls" USING "btree" ("from_user_id");



CREATE INDEX "calls_group_id_idx" ON "public"."calls" USING "btree" ("group_id");



CREATE INDEX "calls_to_user_id_idx" ON "public"."calls" USING "btree" ("to_user_id");



CREATE INDEX "email_integrations_active_idx" ON "public"."email_integrations" USING "btree" ("user_id", "provider", "email") WHERE ("deleted_at" IS NULL);



CREATE INDEX "email_integrations_email_idx" ON "public"."email_integrations" USING "btree" ("email");



CREATE INDEX "email_integrations_provider_idx" ON "public"."email_integrations" USING "btree" ("provider");



CREATE INDEX "email_integrations_user_id_idx" ON "public"."email_integrations" USING "btree" ("user_id");



CREATE INDEX "follow_ups_complete_idx" ON "public"."follow_ups" USING "btree" ("completed");



CREATE INDEX "follow_ups_date_idx" ON "public"."follow_ups" USING "btree" ("date");



CREATE INDEX "idx_calls_call_sid" ON "public"."calls" USING "btree" ("call_sid");



CREATE INDEX "idx_companies_address_trgm" ON "public"."companies" USING "gin" ("street_address" "public"."gin_trgm_ops");



CREATE INDEX "idx_companies_city_trgm" ON "public"."companies" USING "gin" ("city" "public"."gin_trgm_ops");



CREATE INDEX "idx_companies_filters" ON "public"."companies" USING "btree" ("organization_id", "type", "neighborhood", "deleted_at");



CREATE INDEX "idx_companies_name_trgm" ON "public"."companies" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_companies_organization_id" ON "public"."companies" USING "btree" ("organization_id");



CREATE INDEX "idx_companies_sort_created" ON "public"."companies" USING "btree" ("created_at" DESC NULLS LAST);



CREATE INDEX "idx_companies_sort_name" ON "public"."companies" USING "btree" ("name");



CREATE INDEX "idx_companies_sort_type" ON "public"."companies" USING "btree" ("type");



CREATE INDEX "idx_companies_type_trgm" ON "public"."companies" USING "gin" ("type" "public"."gin_trgm_ops");



CREATE INDEX "idx_follow_ups_next_follow_up_id" ON "public"."follow_ups" USING "btree" ("next_follow_up_id");



CREATE INDEX "idx_organizations_deleted_at" ON "public"."organizations" USING "btree" ("deleted_at");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_users_organization_id" ON "public"."users" USING "btree" ("organization_id");



CREATE INDEX "integrations_provider_idx" ON "public"."integrations" USING "btree" ("provider");



CREATE INDEX "integrations_type_idx" ON "public"."integrations" USING "btree" ("type");



CREATE INDEX "integrations_user_id_idx" ON "public"."integrations" USING "btree" ("user_id");



CREATE INDEX "message_templates_created_at_idx" ON "public"."message_templates" USING "btree" ("created_at");



CREATE INDEX "message_templates_created_by_idx" ON "public"."message_templates" USING "btree" ("created_by");



CREATE INDEX "message_templates_organization_id_idx" ON "public"."message_templates" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "user_roles_id_idx" ON "public"."user_roles" USING "btree" ("id");



CREATE INDEX "user_roles_org_id_idx" ON "public"."user_roles" USING "btree" ("organization_id");



CREATE INDEX "user_roles_role_idx" ON "public"."user_roles" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "handle_email_integrations_updated_at" BEFORE UPDATE ON "public"."email_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_integrations_updated_at" BEFORE UPDATE ON "public"."integrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "refresh_user_roles_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."users" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refresh_user_roles"();



CREATE OR REPLACE TRIGGER "soft_delete_communications" BEFORE DELETE ON "public"."communications" FOR EACH ROW EXECUTE FUNCTION "public"."handle_soft_delete_communications"();



CREATE OR REPLACE TRIGGER "soft_delete_message_templates" BEFORE DELETE ON "public"."message_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_soft_delete_message_templates"();



CREATE OR REPLACE TRIGGER "update_b2c_lead_info_updated_at" BEFORE UPDATE ON "public"."b2c_lead_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_calls_updated_at" BEFORE UPDATE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_groups_updated_at" BEFORE UPDATE ON "public"."user_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_phone_status_last_updated" BEFORE UPDATE ON "public"."user_phone_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_phone_status_updated_at" BEFORE UPDATE ON "public"."user_phone_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vob_records_updated_at" BEFORE UPDATE ON "public"."vob_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_user_auth_trigger" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."validate_user_auth"();



CREATE OR REPLACE TRIGGER "vob_versioning_trigger" BEFORE INSERT ON "public"."vob_records" FOR EACH ROW EXECUTE FUNCTION "public"."handle_vob_versioning"();



ALTER TABLE ONLY "public"."b2c_lead_info"
    ADD CONSTRAINT "b2c_lead_info_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."b2c_lead_info"
    ADD CONSTRAINT "b2c_lead_info_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."b2c_lead_info"
    ADD CONSTRAINT "b2c_lead_info_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."communications"
    ADD CONSTRAINT "communications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."email_integrations"
    ADD CONSTRAINT "email_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_next_follow_up_id_fkey" FOREIGN KEY ("next_follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."user_phone_status"
    ADD CONSTRAINT "user_phone_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_won_by_fkey" FOREIGN KEY ("won_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."vob_covered_codes"
    ADD CONSTRAINT "vob_covered_codes_vob_record_id_fkey" FOREIGN KEY ("vob_record_id") REFERENCES "public"."vob_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vob_records"
    ADD CONSTRAINT "vob_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vob_records"
    ADD CONSTRAINT "vob_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Admins can delete users in their organization" ON "public"."users" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."get_user_context"("auth"."uid"()) "ctx"("organization_id", "role")
  WHERE (("ctx"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND (("ctx"."role" = 'super_admin'::"text") OR (("ctx"."role" = 'admin'::"text") AND ("ctx"."organization_id" = "ctx"."organization_id")))))));



CREATE POLICY "Admins can update users in their organization" ON "public"."users" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."get_user_context"("auth"."uid"()) "ctx"("organization_id", "role")
  WHERE (("ctx"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND (("ctx"."role" = 'super_admin'::"text") OR (("ctx"."role" = 'admin'::"text") AND ("ctx"."organization_id" = "ctx"."organization_id")))))));



CREATE POLICY "Enable read access for authenticated users" ON "public"."follow_up_sequences" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Only super admins can create groups" ON "public"."user_groups" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'super_admin'::"text"));



CREATE POLICY "Only super admins can manage memberships" ON "public"."group_memberships" USING ((("auth"."jwt"() ->> 'role'::"text") = 'super_admin'::"text"));



CREATE POLICY "Only super admins can update groups" ON "public"."user_groups" FOR UPDATE USING ((("auth"."jwt"() ->> 'role'::"text") = 'super_admin'::"text"));



CREATE POLICY "Service role can manage calls" ON "public"."calls" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "System can create users through trigger" ON "public"."users" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Users can add own email integrations" ON "public"."email_integrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can add own integrations" ON "public"."integrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create templates in their organization" ON "public"."message_templates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND ("r"."organization_id" = "message_templates"."organization_id")))));



CREATE POLICY "Users can delete own email integrations" ON "public"."email_integrations" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can delete own integrations" ON "public"."integrations" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can delete their own templates" ON "public"."message_templates" FOR DELETE USING ((("auth"."uid"() = "created_by") AND ("deleted_at" IS NULL)));



CREATE POLICY "Users can insert B2C lead info" ON "public"."b2c_lead_info" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role", 'agent'::"public"."user_role"])) OR (EXISTS ( SELECT 1
           FROM "public"."users" "lead_user"
          WHERE (("lead_user"."id" = "b2c_lead_info"."user_id") AND ("lead_user"."referrer_id" = "auth"."uid"()) AND ("lead_user"."deleted_at" IS NULL))))) AND ("auth_user"."deleted_at" IS NULL)))));



CREATE POLICY "Users can insert covered codes for their VOB records" ON "public"."vob_covered_codes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vob_records"
  WHERE (("vob_records"."id" = "vob_covered_codes"."vob_record_id") AND ("vob_records"."verified_by" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own B2C lead info" ON "public"."b2c_lead_info" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can insert their own VOB records" ON "public"."vob_records" FOR INSERT WITH CHECK (("auth"."uid"() = "verified_by"));



CREATE POLICY "Users can insert their own status" ON "public"."user_phone_status" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update B2C lead info" ON "public"."b2c_lead_info" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role", 'agent'::"public"."user_role"])) OR (EXISTS ( SELECT 1
           FROM "public"."users" "lead_user"
          WHERE (("lead_user"."id" = "b2c_lead_info"."user_id") AND ("lead_user"."referrer_id" = "auth"."uid"()) AND ("lead_user"."deleted_at" IS NULL))))) AND ("auth_user"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role", 'agent'::"public"."user_role"])) OR (EXISTS ( SELECT 1
           FROM "public"."users" "lead_user"
          WHERE (("lead_user"."id" = "b2c_lead_info"."user_id") AND ("lead_user"."referrer_id" = "auth"."uid"()) AND ("lead_user"."deleted_at" IS NULL))))) AND ("auth_user"."deleted_at" IS NULL)))));



CREATE POLICY "Users can update own email integrations" ON "public"."email_integrations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can update own integrations" ON "public"."integrations" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can update their own B2C lead info" ON "public"."b2c_lead_info" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own VOB records" ON "public"."vob_records" FOR UPDATE USING (("auth"."uid"() = "verified_by"));



CREATE POLICY "Users can update their own status" ON "public"."user_phone_status" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own templates" ON "public"."message_templates" FOR UPDATE USING ((("auth"."uid"() = "created_by") AND ("deleted_at" IS NULL))) WITH CHECK ((("auth"."uid"() = "created_by") AND ("deleted_at" IS NULL)));



CREATE POLICY "Users can view all group memberships" ON "public"."group_memberships" FOR SELECT USING (true);



CREATE POLICY "Users can view all groups" ON "public"."user_groups" FOR SELECT USING (true);



CREATE POLICY "Users can view calls they participated in" ON "public"."calls" FOR SELECT USING ((("auth"."uid"() = "to_user_id") OR ("auth"."uid"() = "from_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_groups"
  WHERE (("user_groups"."id" = "calls"."group_id") AND ("user_groups"."id" IN ( SELECT "group_memberships"."group_id"
           FROM "public"."group_memberships"
          WHERE ("group_memberships"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can view covered codes for their VOB records" ON "public"."vob_covered_codes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vob_records"
  WHERE (("vob_records"."id" = "vob_covered_codes"."vob_record_id") AND ("vob_records"."verified_by" = "auth"."uid"())))));



CREATE POLICY "Users can view own email integrations" ON "public"."email_integrations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can view own integrations" ON "public"."integrations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"public"."user_role") OR ("users"."role" = 'super_admin'::"public"."user_role")) AND ("users"."deleted_at" IS NULL))))));



CREATE POLICY "Users can view templates in their organization" ON "public"."message_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND ("r"."organization_id" = "message_templates"."organization_id")))));



CREATE POLICY "Users can view their own B2C lead info" ON "public"."b2c_lead_info" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role", 'agent'::"public"."user_role"])) OR ("auth"."uid"() = "b2c_lead_info"."user_id") OR (EXISTS ( SELECT 1
           FROM "public"."users" "lead_user"
          WHERE (("lead_user"."id" = "b2c_lead_info"."user_id") AND ("lead_user"."referrer_id" = "auth"."uid"()) AND ("lead_user"."deleted_at" IS NULL))))) AND ("auth_user"."deleted_at" IS NULL)))));



CREATE POLICY "Users can view their own VOB records" ON "public"."vob_records" FOR SELECT USING (("auth"."uid"() = "verified_by"));



CREATE POLICY "Users can view their own calls" ON "public"."calls" FOR SELECT USING (("auth"."uid"() = "to_user_id"));



CREATE POLICY "Users can view their own record and records in their organizati" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("organization_id" = ( SELECT "get_user_context"."organization_id"
   FROM "public"."get_user_context"("auth"."uid"()) "get_user_context"("organization_id", "role")))));



CREATE POLICY "Users can view their own status" ON "public"."user_phone_status" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."b2c_lead_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "communications_insert" ON "public"."communications" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "agent_id") OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."deleted_at" IS NULL) AND ("u"."organization_id" IS NOT NULL) AND (("u"."role" = 'admin'::"public"."user_role") OR ("u"."role" = 'super_admin'::"public"."user_role"))))) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."deleted_at" IS NULL) AND ("u"."organization_id" = ( SELECT "target_user"."organization_id"
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "communications"."user_id") AND ("target_user"."deleted_at" IS NULL)))) AND ("u"."organization_id" IS NOT NULL))))));



CREATE POLICY "communications_select" ON "public"."communications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."deleted_at" IS NULL) AND (("u"."organization_id" = ( SELECT "target_user"."organization_id"
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "communications"."user_id") AND ("target_user"."deleted_at" IS NULL)))) OR ("auth"."uid"() = "communications"."agent_id"))))));



CREATE POLICY "communications_update" ON "public"."communications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "agent_id")) WITH CHECK (("auth"."uid"() = "agent_id"));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_delete" ON "public"."companies" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = 'admin'::"public"."user_role") AND ("users"."organization_id" = "companies"."organization_id")))))));



CREATE POLICY "companies_insert" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])) AND ("users"."organization_id" = "users"."organization_id"))))))));



CREATE POLICY "companies_select" ON "public"."companies" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])) AND ("users"."organization_id" = "companies"."organization_id") AND ("users"."organization_id" IS NOT NULL))))))));



CREATE POLICY "companies_soft_delete" ON "public"."companies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = 'admin'::"public"."user_role") AND ("users"."organization_id" = "companies"."organization_id"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])) AND ("users"."organization_id" = "companies"."organization_id")))))));



CREATE POLICY "companies_update" ON "public"."companies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role"])) AND ("users"."organization_id" = "companies"."organization_id"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."deleted_at" IS NULL) AND (("users"."role" = 'super_admin'::"public"."user_role") OR (("users"."role" = 'admin'::"public"."user_role") AND ("users"."organization_id" = "companies"."organization_id")))))) AND ((("deleted_at" IS NOT NULL) AND ("deleted_at" IS NULL)) OR ("companies".* = "companies".*))));



ALTER TABLE "public"."email_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_up_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_ups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follow_ups_insert_v6" ON "public"."follow_ups" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND ("auth_user"."deleted_at" IS NULL) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) OR (("auth_user"."role" = 'agent'::"public"."user_role") AND (EXISTS ( SELECT 1
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "follow_ups"."user_id") AND ("target_user"."owner_id" = "auth_user"."id"))))))))));



CREATE POLICY "follow_ups_select_v6" ON "public"."follow_ups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND ("auth_user"."deleted_at" IS NULL) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) OR (("auth_user"."role" = 'agent'::"public"."user_role") AND (EXISTS ( SELECT 1
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "follow_ups"."user_id") AND ("target_user"."owner_id" = "auth_user"."id"))))))))));



CREATE POLICY "follow_ups_update_v6" ON "public"."follow_ups" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND ("auth_user"."deleted_at" IS NULL) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) OR (("auth_user"."role" = 'agent'::"public"."user_role") AND (EXISTS ( SELECT 1
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "follow_ups"."user_id") AND ("target_user"."owner_id" = "auth_user"."id")))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "auth_user"
  WHERE (("auth_user"."id" = "auth"."uid"()) AND ("auth_user"."deleted_at" IS NULL) AND (("auth_user"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) OR (("auth_user"."role" = 'agent'::"public"."user_role") AND (EXISTS ( SELECT 1
           FROM "public"."users" "target_user"
          WHERE (("target_user"."id" = "follow_ups"."user_id") AND ("target_user"."owner_id" = "auth_user"."id"))))))))));



ALTER TABLE "public"."group_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_access" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND (("r"."role" = 'super_admin'::"public"."user_role") OR ("r"."organization_id" = "organizations"."id"))))));



CREATE POLICY "organizations_update" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND (("r"."role" = 'super_admin'::"public"."user_role") OR (("r"."role" = 'admin'::"public"."user_role") AND ("r"."organization_id" = "organizations"."id")))))));



CREATE POLICY "service_role_insert" ON "public"."users" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."user_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_phone_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND ("r"."role" = 'super_admin'::"public"."user_role")))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND ("r"."role" = 'admin'::"public"."user_role") AND ("r"."organization_id" = "users"."organization_id") AND ("r"."organization_id" IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND ("r"."role" = 'agent'::"public"."user_role") AND ("r"."organization_id" = "users"."organization_id") AND ("r"."organization_id" IS NOT NULL) AND ("users"."role" = ANY (ARRAY['lead'::"public"."user_role", 'customer'::"public"."user_role"])))))));



CREATE POLICY "users_org_access" ON "public"."users" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND (("r"."role" = 'super_admin'::"public"."user_role") OR (("r"."organization_id" = "users"."organization_id") AND ("r"."organization_id" IS NOT NULL)))))));



CREATE POLICY "users_self_access" ON "public"."users" TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "r"
  WHERE (("r"."id" = "auth"."uid"()) AND ("r"."deleted_at" IS NULL) AND (("r"."role" = 'super_admin'::"public"."user_role") OR (("r"."role" = 'admin'::"public"."user_role") AND ("r"."organization_id" = "users"."organization_id") AND ("r"."organization_id" IS NOT NULL))))))));



ALTER TABLE "public"."vob_covered_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vob_records" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_company_permission"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_company_permission"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_company_permission"("company_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user"("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "company_id" "uuid", "notes" "text", "user_role" "text", "owner_id" "uuid", "user_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user"("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "company_id" "uuid", "notes" "text", "user_role" "text", "owner_id" "uuid", "user_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user"("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "company_id" "uuid", "notes" "text", "user_role" "text", "owner_id" "uuid", "user_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_next_follow_up"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_next_follow_up"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_next_follow_up"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_companies_with_count"("p_organization_id" "uuid", "p_type" "text", "p_neighborhood" "text", "p_search" "text", "p_limit" integer, "p_offset" integer, "p_sort_field" "text", "p_sort_order" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_companies_with_count"("p_organization_id" "uuid", "p_type" "text", "p_neighborhood" "text", "p_search" "text", "p_limit" integer, "p_offset" integer, "p_sort_field" "text", "p_sort_order" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_companies_with_count"("p_organization_id" "uuid", "p_type" "text", "p_neighborhood" "text", "p_search" "text", "p_limit" integer, "p_offset" integer, "p_sort_field" "text", "p_sort_order" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_follow_up_date"("p_user_id" "uuid", "p_current_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_follow_up_date"("p_user_id" "uuid", "p_current_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_follow_up_date"("p_user_id" "uuid", "p_current_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_context"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_context"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_context"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_soft_delete_communications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_soft_delete_communications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_soft_delete_communications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_soft_delete_message_templates"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_soft_delete_message_templates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_soft_delete_message_templates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_vob_versioning"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_vob_versioning"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_vob_versioning"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."text_to_user_role"("role_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_to_user_role"("role_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_to_user_role"("role_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_to_customer"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_to_customer"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_to_customer"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_statuses_and_generate_follow_ups"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_statuses_and_generate_follow_ups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_statuses_and_generate_follow_ups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_statuses_for_followups"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_statuses_for_followups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_statuses_for_followups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_user_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_auth"() TO "service_role";



GRANT ALL ON TABLE "public"."b2c_lead_info" TO "anon";
GRANT ALL ON TABLE "public"."b2c_lead_info" TO "authenticated";
GRANT ALL ON TABLE "public"."b2c_lead_info" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."communications" TO "anon";
GRANT ALL ON TABLE "public"."communications" TO "authenticated";
GRANT ALL ON TABLE "public"."communications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."communications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."communications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."communications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."email_integrations" TO "anon";
GRANT ALL ON TABLE "public"."email_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."email_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."follow_up_sequences" TO "anon";
GRANT ALL ON TABLE "public"."follow_up_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_up_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_ups" TO "service_role";



GRANT ALL ON TABLE "public"."group_memberships" TO "anon";
GRANT ALL ON TABLE "public"."group_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."group_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "anon";
GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."message_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."user_groups" TO "anon";
GRANT ALL ON TABLE "public"."user_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."user_groups" TO "service_role";



GRANT ALL ON TABLE "public"."user_phone_status" TO "anon";
GRANT ALL ON TABLE "public"."user_phone_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_phone_status" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vob_covered_codes" TO "anon";
GRANT ALL ON TABLE "public"."vob_covered_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."vob_covered_codes" TO "service_role";



GRANT ALL ON TABLE "public"."vob_records" TO "anon";
GRANT ALL ON TABLE "public"."vob_records" TO "authenticated";
GRANT ALL ON TABLE "public"."vob_records" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






RESET ALL;
