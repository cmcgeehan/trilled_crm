export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          plan: string
          subscription_status: string
          max_users: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: string
          subscription_status?: string
          max_users?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: string
          subscription_status?: string
          max_users?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      integrations: {
        Row: {
          id: string
          created_at: string
          user_id: string
          provider: string
          type: string
          credentials: Json
          is_active: boolean
          deleted_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          provider: string
          type: string
          credentials?: Json
          is_active?: boolean
          deleted_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          provider?: string
          type?: string
          credentials?: Json
          is_active?: boolean
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      communications: {
        Row: {
          id: string
          created_at: string
          direction: 'outbound' | 'inbound' | 'internal'
          to_address: string
          from_address: string
          delivered_at: string
          agent_id: string
          user_id: string
          content: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          direction: 'outbound' | 'inbound' | 'internal'
          to_address: string
          from_address: string
          delivered_at: string
          agent_id: string
          user_id: string
          content: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          direction?: 'outbound' | 'inbound' | 'internal'
          to_address?: string
          from_address?: string
          delivered_at?: string
          agent_id?: string
          user_id?: string
          content?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_agent_id_fkey"
            columns: ["agent_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          role: string
          status: string
          position: string | null
          phone: string | null
          notes: string | null
          owner_id: string | null
          company_id: string | null
          referral_company_id: string | null
          organization_id: string | null
          lead_type: "referral_partner" | "potential_customer" | null
          lost_reason: string | null
          lost_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          email: string
          first_name?: string | null
          last_name?: string | null
          role?: string
          status?: string
          position?: string | null
          phone?: string | null
          notes?: string | null
          owner_id?: string | null
          company_id?: string | null
          referral_company_id?: string | null
          organization_id?: string | null
          lead_type?: "referral_partner" | "potential_customer" | null
          lost_reason?: string | null
          lost_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          role?: string
          status?: string
          position?: string | null
          phone?: string | null
          notes?: string | null
          owner_id?: string | null
          company_id?: string | null
          referral_company_id?: string | null
          organization_id?: string | null
          lead_type?: "referral_partner" | "potential_customer" | null
          lost_reason?: string | null
          lost_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          }
        ]
      }
      leads: {
        Row: {
          id: string
          name: string
          status: "new" | "needs_action" | "follow_up" | "awaiting_response" | "closed_won" | "closed_lost"
          priority: number
          assigned_to: string
          created_at: string
          updated_at: string
          closed_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          status?: "new" | "needs_action" | "follow_up" | "awaiting_response" | "closed_won" | "closed_lost"
          priority?: number
          assigned_to: string
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          status?: "new" | "needs_action" | "follow_up" | "awaiting_response" | "closed_won" | "closed_lost"
          priority?: number
          assigned_to?: string
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      follow_ups: {
        Row: {
          id: string
          created_at: string
          date: string
          type: string
          user_id: string
          completed_at: string | null
          next_follow_up_id: string | null
          notes: string | null
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          date: string
          type: string
          user_id: string
          completed_at?: string | null
          next_follow_up_id?: string | null
          notes?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          date?: string
          type?: string
          user_id?: string
          completed_at?: string | null
          next_follow_up_id?: string | null
          notes?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_next_follow_up_id_fkey"
            columns: ["next_follow_up_id"]
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          }
        ]
      }
      companies: {
        Row: {
          id: string
          name: string
          type: string | null
          organization_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          type?: string | null
          organization_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: string | null
          organization_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      email_integrations: {
        Row: {
          id: string
          user_id: string
          provider: string
          refresh_token: string
          access_token: string | null
          token_expires_at: string | null
          email: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          refresh_token: string
          access_token?: string | null
          token_expires_at?: string | null
          email: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          refresh_token?: string
          access_token?: string | null
          token_expires_at?: string | null
          email?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_integrations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      vob_records: {
        Row: {
          id: string
          user_id: string
          version: number
          verified_by: string
          created_date: string
          reference_id: string
          rep_spoke_to: string
          relationship_to_subscriber: string
          dependent_ages: string | null
          subscriber_address: string
          cob_info: string | null
          plan_type: string
          policy_type: string
          subscriber_name: string
          plan_year: string
          funding_type: string
          effective_date: string
          termination_date: string | null
          payment_destination: "facility" | "patient"
          deductible: number | null
          deductible_met: number | null
          out_of_pocket: number | null
          out_of_pocket_met: number | null
          coinsurance: number | null
          copay: number | null
          deductible_applies_to_oop: boolean
          cross_accumulate: boolean
          op_coverage: boolean
          iop_coverage: boolean
          telehealth_coverage: boolean
          reimbursement_type: string | null
          multi_plan: boolean
          notes: string | null
          preauth_reference_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          version?: number
          verified_by: string
          created_date?: string
          reference_id: string
          rep_spoke_to: string
          relationship_to_subscriber: string
          dependent_ages?: string | null
          subscriber_address: string
          cob_info?: string | null
          plan_type: string
          policy_type: string
          subscriber_name: string
          plan_year: string
          funding_type: string
          effective_date: string
          termination_date?: string | null
          payment_destination: "facility" | "patient"
          deductible?: number | null
          deductible_met?: number | null
          out_of_pocket?: number | null
          out_of_pocket_met?: number | null
          coinsurance?: number | null
          copay?: number | null
          deductible_applies_to_oop?: boolean
          cross_accumulate?: boolean
          op_coverage?: boolean
          iop_coverage?: boolean
          telehealth_coverage?: boolean
          reimbursement_type?: string | null
          multi_plan?: boolean
          notes?: string | null
          preauth_reference_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          version?: number
          verified_by?: string
          created_date?: string
          reference_id?: string
          rep_spoke_to?: string
          relationship_to_subscriber?: string
          dependent_ages?: string | null
          subscriber_address?: string
          cob_info?: string | null
          plan_type?: string
          policy_type?: string
          subscriber_name?: string
          plan_year?: string
          funding_type?: string
          effective_date?: string
          termination_date?: string | null
          payment_destination?: "facility" | "patient"
          deductible?: number | null
          deductible_met?: number | null
          out_of_pocket?: number | null
          out_of_pocket_met?: number | null
          coinsurance?: number | null
          copay?: number | null
          deductible_applies_to_oop?: boolean
          cross_accumulate?: boolean
          op_coverage?: boolean
          iop_coverage?: boolean
          telehealth_coverage?: boolean
          reimbursement_type?: string | null
          multi_plan?: boolean
          notes?: string | null
          preauth_reference_number?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vob_covered_codes: {
        Row: {
          id: string
          vob_record_id: string
          code: number
          description: string
          covered_for_telehealth: boolean
          authorization_required: boolean
          created_at: string
        }
        Insert: {
          id?: string
          vob_record_id: string
          code: number
          description: string
          covered_for_telehealth?: boolean
          authorization_required?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          vob_record_id?: string
          code?: number
          description?: string
          covered_for_telehealth?: boolean
          authorization_required?: boolean
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      lead_status: "new" | "needs_action" | "follow_up" | "awaiting_response" | "closed_won" | "closed_lost"
      follow_up_type: "email" | "sms" | "call" | "meeting" | "tour"
    }
    CompositeTypes: {}
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
