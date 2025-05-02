export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      b2c_lead_info: {
        Row: {
          address: string
          created_at: string
          created_by: string
          dob: string | null
          gender: Database["public"]["Enums"]["gender_type"]
          headshot_url: string | null
          id: string
          marital_status: Database["public"]["Enums"]["marital_status_type"]
          parental_status: Database["public"]["Enums"]["parental_status_type"]
          referral_source: string
          ssn_last_four: string
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          created_by: string
          dob?: string | null
          gender: Database["public"]["Enums"]["gender_type"]
          headshot_url?: string | null
          id?: string
          marital_status: Database["public"]["Enums"]["marital_status_type"]
          parental_status: Database["public"]["Enums"]["parental_status_type"]
          referral_source: string
          ssn_last_four: string
          updated_at?: string
          updated_by: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          created_by?: string
          dob?: string | null
          gender?: Database["public"]["Enums"]["gender_type"]
          headshot_url?: string | null
          id?: string
          marital_status?: Database["public"]["Enums"]["marital_status_type"]
          parental_status?: Database["public"]["Enums"]["parental_status_type"]
          referral_source?: string
          ssn_last_four?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2c_lead_info_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2c_lead_info_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          call_sid: string | null
          communication_id: number | null
          created_at: string | null
          duration: number | null
          ended_at: string | null
          from_number: string
          from_user_id: string | null
          group_id: string | null
          id: string
          recording_url: string | null
          started_at: string | null
          status: string
          to_number: string
          to_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          call_sid?: string | null
          communication_id?: number | null
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          from_number: string
          from_user_id?: string | null
          group_id?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status: string
          to_number: string
          to_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          call_sid?: string | null
          communication_id?: number | null
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          from_number?: string
          from_user_id?: string | null
          group_id?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status?: string
          to_number?: string
          to_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          agent_id: string | null
          communication_type: string | null
          communication_type_id: string | null
          content: string | null
          created_at: string
          deleted_at: string | null
          delivered_at: string | null
          direction: string | null
          from_address: string | null
          id: number
          to_address: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          communication_type?: string | null
          communication_type_id?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          direction?: string | null
          from_address?: string | null
          id?: number
          to_address?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          communication_type?: string | null
          communication_type_id?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          direction?: string | null
          from_address?: string | null
          id?: number
          to_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string | null
          neighborhood: string | null
          notes: string | null
          organization_id: string | null
          postal_code: string | null
          state: string | null
          street_address: string | null
          type: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          organization_id?: string | null
          postal_code?: string | null
          state?: string | null
          street_address?: string | null
          type?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          organization_id?: string | null
          postal_code?: string | null
          state?: string | null
          street_address?: string | null
          type?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_integrations: {
        Row: {
          access_token: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          provider: string
          refresh_token: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id?: string
          provider: string
          refresh_token: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          provider?: string
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          created_at: string | null
          id: string
          interval_days: number
          is_infinite: boolean | null
          name: string
          sequence_order: number
          type: Database["public"]["Enums"]["follow_up_sequence_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          interval_days: number
          is_infinite?: boolean | null
          name: string
          sequence_order: number
          type: Database["public"]["Enums"]["follow_up_sequence_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          interval_days?: number
          is_infinite?: boolean | null
          name?: string
          sequence_order?: number
          type?: Database["public"]["Enums"]["follow_up_sequence_type"]
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          id: string
          next_follow_up_id: string | null
          notes: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          date: string
          deleted_at?: string | null
          id?: string
          next_follow_up_id?: string | null
          notes?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          next_follow_up_id?: string | null
          notes?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_next_follow_up_id_fkey"
            columns: ["next_follow_up_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          is_admin: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          is_admin?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          is_admin?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string | null
          credentials: Json | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          provider: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credentials?: Json | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          provider: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credentials?: Json | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          max_users: number
          name: string
          plan: string
          slug: string
          subscription_period_end: string | null
          subscription_period_start: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          max_users?: number
          name: string
          plan?: string
          slug: string
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          max_users?: number
          name?: string
          plan?: string
          slug?: string
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_groups: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          twilio_phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          twilio_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          twilio_phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_phone_status: {
        Row: {
          id: string
          last_updated: string | null
          status: Database["public"]["Enums"]["user_phone_status_enum"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          status?: Database["public"]["Enums"]["user_phone_status_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          status?: Database["public"]["Enums"]["user_phone_status_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          company: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_source: string | null
          lead_type: Database["public"]["Enums"]["lead_type"] | null
          linkedin: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          organization_id: string | null
          owner_id: string | null
          phone: string | null
          position: string | null
          referrer_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          sequence_position: number | null
          sequence_type:
            | Database["public"]["Enums"]["follow_up_sequence_type"]
            | null
          state_province: string | null
          status: string | null
          twilio_phone: string | null
          updated_at: string | null
          won_at: string | null
          won_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          linkedin?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          position?: string | null
          referrer_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sequence_position?: number | null
          sequence_type?:
            | Database["public"]["Enums"]["follow_up_sequence_type"]
            | null
          state_province?: string | null
          status?: string | null
          twilio_phone?: string | null
          updated_at?: string | null
          won_at?: string | null
          won_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          linkedin?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          position?: string | null
          referrer_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sequence_position?: number | null
          sequence_type?:
            | Database["public"]["Enums"]["follow_up_sequence_type"]
            | null
          state_province?: string | null
          status?: string | null
          twilio_phone?: string | null
          updated_at?: string | null
          won_at?: string | null
          won_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_won_by_fkey"
            columns: ["won_by"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_won_by_fkey"
            columns: ["won_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vob_covered_codes: {
        Row: {
          authorization_required: boolean | null
          code: number
          covered_for_telehealth: boolean | null
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          vob_record_id: string
        }
        Insert: {
          authorization_required?: boolean | null
          code: number
          covered_for_telehealth?: boolean | null
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          vob_record_id: string
        }
        Update: {
          authorization_required?: boolean | null
          code?: number
          covered_for_telehealth?: boolean | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          vob_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vob_covered_codes_vob_record_id_fkey"
            columns: ["vob_record_id"]
            isOneToOne: false
            referencedRelation: "vob_records"
            referencedColumns: ["id"]
          },
        ]
      }
      vob_records: {
        Row: {
          cob_info: string | null
          coinsurance: number | null
          copay: number | null
          created_at: string
          created_date: string
          cross_accumulate: boolean | null
          deductible: number | null
          deductible_applies_to_oop: boolean | null
          deductible_met: number | null
          dependent_ages: string | null
          effective_date: string
          funding_type: string
          id: string
          iop_coverage: boolean | null
          multi_plan: boolean | null
          notes: string | null
          op_coverage: boolean | null
          out_of_pocket: number | null
          out_of_pocket_met: number | null
          payment_destination: Database["public"]["Enums"]["payment_destination_type"]
          plan_type: string
          plan_year: string
          policy_type: string
          preauth_reference_number: string | null
          reference_id: string
          reimbursement_type: string | null
          relationship_to_subscriber: string
          rep_spoke_to: string
          subscriber_address: string
          subscriber_name: string
          telehealth_coverage: boolean | null
          termination_date: string | null
          updated_at: string
          user_id: string
          verified_by: string
          version: number
        }
        Insert: {
          cob_info?: string | null
          coinsurance?: number | null
          copay?: number | null
          created_at?: string
          created_date?: string
          cross_accumulate?: boolean | null
          deductible?: number | null
          deductible_applies_to_oop?: boolean | null
          deductible_met?: number | null
          dependent_ages?: string | null
          effective_date: string
          funding_type: string
          id?: string
          iop_coverage?: boolean | null
          multi_plan?: boolean | null
          notes?: string | null
          op_coverage?: boolean | null
          out_of_pocket?: number | null
          out_of_pocket_met?: number | null
          payment_destination: Database["public"]["Enums"]["payment_destination_type"]
          plan_type: string
          plan_year: string
          policy_type: string
          preauth_reference_number?: string | null
          reference_id: string
          reimbursement_type?: string | null
          relationship_to_subscriber: string
          rep_spoke_to: string
          subscriber_address: string
          subscriber_name: string
          telehealth_coverage?: boolean | null
          termination_date?: string | null
          updated_at?: string
          user_id: string
          verified_by: string
          version?: number
        }
        Update: {
          cob_info?: string | null
          coinsurance?: number | null
          copay?: number | null
          created_at?: string
          created_date?: string
          cross_accumulate?: boolean | null
          deductible?: number | null
          deductible_applies_to_oop?: boolean | null
          deductible_met?: number | null
          dependent_ages?: string | null
          effective_date?: string
          funding_type?: string
          id?: string
          iop_coverage?: boolean | null
          multi_plan?: boolean | null
          notes?: string | null
          op_coverage?: boolean | null
          out_of_pocket?: number | null
          out_of_pocket_met?: number | null
          payment_destination?: Database["public"]["Enums"]["payment_destination_type"]
          plan_type?: string
          plan_year?: string
          policy_type?: string
          preauth_reference_number?: string | null
          reference_id?: string
          reimbursement_type?: string | null
          relationship_to_subscriber?: string
          rep_spoke_to?: string
          subscriber_address?: string
          subscriber_name?: string
          telehealth_coverage?: boolean | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string
          verified_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vob_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vob_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_roles: {
        Row: {
          deleted_at: string | null
          id: string | null
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_company_permission: {
        Args: { company_id: string }
        Returns: boolean
      }
      create_user: {
        Args: {
          user_id: string
          first_name: string
          last_name: string
          email: string
          phone: string
          company_id: string
          notes: string
          user_role: string
          owner_id: string
          user_status?: string
        }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          company: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_source: string | null
          lead_type: Database["public"]["Enums"]["lead_type"] | null
          linkedin: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          organization_id: string | null
          owner_id: string | null
          phone: string | null
          position: string | null
          referrer_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          sequence_position: number | null
          sequence_type:
            | Database["public"]["Enums"]["follow_up_sequence_type"]
            | null
          state_province: string | null
          status: string | null
          twilio_phone: string | null
          updated_at: string | null
          won_at: string | null
          won_by: string | null
        }
      }
      generate_next_follow_up: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_companies_with_count: {
        Args: {
          p_organization_id?: string
          p_type?: string
          p_neighborhood?: string
          p_search?: string
          p_limit?: number
          p_offset?: number
          p_sort_field?: string
          p_sort_order?: string
        }
        Returns: {
          companies: Json
          total_count: number
        }[]
      }
      get_next_follow_up_date: {
        Args: { p_user_id: string; p_current_date: string }
        Returns: string
      }
      get_user_context: {
        Args: { user_id: string }
        Returns: {
          organization_id: string
          role: string
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      text_to_user_role: {
        Args: { role_text: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      transition_to_customer: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_user_statuses_and_generate_follow_ups: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_user_statuses_for_followups: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      follow_up_sequence_type: "lead" | "customer"
      follow_up_type: "email" | "sms" | "call" | "meeting" | "tour"
      gender_type:
        | "Male"
        | "Female"
        | "Non-binary"
        | "Other"
        | "Prefer not to say"
      lead_type: "referral_partner" | "potential_customer"
      marital_status_type: "Single" | "Married" | "Divorced" | "Widowed"
      parental_status_type: "Has children" | "No children"
      payment_destination_type: "facility" | "patient"
      user_phone_status_enum:
        | "available"
        | "busy"
        | "unavailable"
        | "wrap-up"
        | "away"
        | "offline"
      user_role: "lead" | "customer" | "agent" | "admin" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      follow_up_sequence_type: ["lead", "customer"],
      follow_up_type: ["email", "sms", "call", "meeting", "tour"],
      gender_type: [
        "Male",
        "Female",
        "Non-binary",
        "Other",
        "Prefer not to say",
      ],
      lead_type: ["referral_partner", "potential_customer"],
      marital_status_type: ["Single", "Married", "Divorced", "Widowed"],
      parental_status_type: ["Has children", "No children"],
      payment_destination_type: ["facility", "patient"],
      user_phone_status_enum: [
        "available",
        "busy",
        "unavailable",
        "wrap-up",
        "away",
        "offline",
      ],
      user_role: ["lead", "customer", "agent", "admin", "super_admin"],
    },
  },
} as const
