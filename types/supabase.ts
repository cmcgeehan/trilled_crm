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
          email: string | null
          phone: string | null
          first_name: string | null
          last_name: string | null
          role: 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
          status: string
          lost_reason: string | null
          lost_at: string | null
          owner_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          organization_id: string | null
          position: string | null
          lead_type: 'referral_partner' | 'potential_customer' | null
          company_id: string | null
          referral_company_id: string | null
        }
        Insert: {
          id?: string
          email?: string | null
          phone?: string | null
          first_name?: string | null
          last_name?: string | null
          role?: 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
          status?: string
          lost_reason?: string | null
          lost_at?: string | null
          owner_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          organization_id?: string | null
          position?: string | null
          lead_type?: 'referral_partner' | 'potential_customer' | null
          company_id?: string | null
          referral_company_id?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          phone?: string | null
          first_name?: string | null
          last_name?: string | null
          role?: 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
          status?: string
          lost_reason?: string | null
          lost_at?: string | null
          owner_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          organization_id?: string | null
          position?: string | null
          lead_type?: 'referral_partner' | 'potential_customer' | null
          company_id?: string | null
          referral_company_id?: string | null
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
          user_id: string
          title: string
          description: string | null
          date: string | null
          completed: boolean
          completed_at: string | null
          deleted_at: string | null
          next_follow_up_id: string | null
          type: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          title: string
          description?: string | null
          date?: string | null
          completed?: boolean
          completed_at?: string | null
          deleted_at?: string | null
          next_follow_up_id?: string | null
          type?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          title?: string
          description?: string | null
          date?: string | null
          completed?: boolean
          completed_at?: string | null
          deleted_at?: string | null
          next_follow_up_id?: string | null
          type?: string | null
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
          created_at: string
          name: string | null
          type: string | null
          deleted_at: string | null
          street_address: string | null
          neighborhood: string | null
          city: string | null
          state: string | null
          postal_code: string | null
          country: string | null
          lost_reason: string | null
          other_reason: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          name?: string | null
          type?: string | null
          deleted_at?: string | null
          street_address?: string | null
          neighborhood?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          country?: string | null
          lost_reason?: string | null
          other_reason?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string | null
          type?: string | null
          deleted_at?: string | null
          street_address?: string | null
          neighborhood?: string | null
          city?: string | null
          state?: string | null
          postal_code?: string | null
          country?: string | null
          lost_reason?: string | null
          other_reason?: string | null
        }
        Relationships: []
      }
      email_integrations: {
        Row: {
          id: string
          user_id: string
          provider: 'gmail' | 'outlook'
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
          provider: 'gmail' | 'outlook'
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
          provider?: 'gmail' | 'outlook'
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
    }
    Views: {}
    Functions: {}
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
