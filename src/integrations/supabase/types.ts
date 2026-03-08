export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_otp_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          failed_attempts: number
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          failed_attempts?: number
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          project_id: string | null
          record_data: Json
          record_id: string
          table_name: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          project_id?: string | null
          record_data: Json
          record_id: string
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          project_id?: string | null
          record_data?: Json
          record_id?: string
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      baseline_items: {
        Row: {
          baseline_id: string
          category: string
          cost_type: string
          created_at: string
          description: string
          end_month: number | null
          id: string
          month: number | null
          planned_amount: number
          start_month: number | null
        }
        Insert: {
          baseline_id: string
          category: string
          cost_type?: string
          created_at?: string
          description: string
          end_month?: number | null
          id?: string
          month?: number | null
          planned_amount?: number
          start_month?: number | null
        }
        Update: {
          baseline_id?: string
          category?: string
          cost_type?: string
          created_at?: string
          description?: string
          end_month?: number | null
          id?: string
          month?: number | null
          planned_amount?: number
          start_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseline_items_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "cost_baselines"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          category: string
          cost_class: string
          cost_type: string
          created_at: string
          description: string
          end_month: number | null
          id: string
          month: number | null
          planned_amount: number
          project_id: string
          resource_id: string | null
          start_month: number | null
          user_id: string
        }
        Insert: {
          category: string
          cost_class?: string
          cost_type?: string
          created_at?: string
          description: string
          end_month?: number | null
          id?: string
          month?: number | null
          planned_amount?: number
          project_id: string
          resource_id?: string | null
          start_month?: number | null
          user_id: string
        }
        Update: {
          category?: string
          cost_class?: string
          cost_type?: string
          created_at?: string
          description?: string
          end_month?: number | null
          id?: string
          month?: number | null
          planned_amount?: number
          project_id?: string
          resource_id?: string | null
          start_month?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          amount_impact: number
          approved_by: string | null
          approved_date: string | null
          change_type: string
          created_at: string
          description: string
          duration_impact: number
          id: string
          project_id: string
          requested_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_impact?: number
          approved_by?: string | null
          approved_date?: string | null
          change_type?: string
          created_at?: string
          description: string
          duration_impact?: number
          id?: string
          project_id: string
          requested_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_impact?: number
          approved_by?: string | null
          approved_date?: string | null
          change_type?: string
          created_at?: string
          description?: string
          duration_impact?: number
          id?: string
          project_id?: string
          requested_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo?: string | null
          name: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cost_baselines: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          project_id: string
          total_planned: number
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id: string
          total_planned?: number
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          total_planned?: number
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_baselines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      custodies: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          id: string
          notes: string | null
          project_id: string | null
          resource_name: string
          user_id: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          resource_name: string
          user_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          resource_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custodies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custodies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          budget_item_id: string | null
          category: string
          created_at: string
          custody_id: string | null
          date: string
          description: string
          id: string
          month: number
          notes: string | null
          project_id: string
          resource_id: string | null
          responsible: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          budget_item_id?: string | null
          category: string
          created_at?: string
          custody_id?: string | null
          date: string
          description: string
          id?: string
          month?: number
          notes?: string | null
          project_id: string
          resource_id?: string | null
          responsible?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          budget_item_id?: string | null
          category?: string
          created_at?: string
          custody_id?: string | null
          date?: string
          description?: string
          id?: string
          month?: number
          notes?: string | null
          project_id?: string
          resource_id?: string | null
          responsible?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      indirect_costs: {
        Row: {
          allocation_method: string
          amount: number
          category: string
          company_id: string
          created_at: string
          date: string
          description: string
          id: string
          month: number
          user_id: string
        }
        Insert: {
          allocation_method?: string
          amount?: number
          category?: string
          company_id: string
          created_at?: string
          date: string
          description: string
          id?: string
          month: number
          user_id: string
        }
        Update: {
          allocation_method?: string
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          date?: string
          description?: string
          id?: string
          month?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indirect_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          created_at: string
          description: string | null
          id: string
          linked_revenue_id: string | null
          name: string
          percent_complete: number
          planned_end: string | null
          planned_start: string | null
          project_id: string
          sort_order: number
          status: string
          user_id: string
          weight: number
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          description?: string | null
          id?: string
          linked_revenue_id?: string | null
          name: string
          percent_complete?: number
          planned_end?: string | null
          planned_start?: string | null
          project_id: string
          sort_order?: number
          status?: string
          user_id: string
          weight?: number
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          description?: string | null
          id?: string
          linked_revenue_id?: string | null
          name?: string
          percent_complete?: number
          planned_end?: string | null
          planned_start?: string | null
          project_id?: string
          sort_order?: number
          status?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "milestones_linked_revenue_id_fkey"
            columns: ["linked_revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      periodic_snapshots: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metrics: Json
          period: string
          snapshot_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metrics?: Json
          period: string
          snapshot_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metrics?: Json
          period?: string
          snapshot_date?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          fiscal_year: string | null
          id: string
          name: string
          notes: string | null
          target_margin: number
          target_revenue: number
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          fiscal_year?: string | null
          id?: string
          name: string
          notes?: string | null
          target_margin?: number
          target_revenue?: number
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          fiscal_year?: string | null
          id?: string
          name?: string
          notes?: string | null
          target_margin?: number
          target_revenue?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_logo: string | null
          company_id: string
          contract_type: string
          contract_value: number
          created_at: string
          currency: string
          description: string | null
          duration_months: number
          end_date: string | null
          id: string
          management_reserve: number
          name: string
          percent_complete: number
          portfolio_id: string | null
          resource_count: number
          retention_percent: number
          start_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          client_logo?: string | null
          company_id: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_months?: number
          end_date?: string | null
          id?: string
          management_reserve?: number
          name: string
          percent_complete?: number
          portfolio_id?: string | null
          resource_count?: number
          retention_percent?: number
          start_date?: string | null
          status?: string
          user_id: string
        }
        Update: {
          client_logo?: string | null
          company_id?: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_months?: number
          end_date?: string | null
          id?: string
          management_reserve?: number
          name?: string
          percent_complete?: number
          portfolio_id?: string | null
          resource_count?: number
          retention_percent?: number
          start_date?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          id: string
          monthly_cost: number
          name: string
          project_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_cost?: number
          name: string
          project_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_cost?: number
          name?: string
          project_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      revenues: {
        Row: {
          amount: number
          collection_date: string | null
          created_at: string
          date: string
          description: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          month: number
          project_id: string
          revenue_type: string
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          collection_date?: string | null
          created_at?: string
          date: string
          description: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          month?: number
          project_id: string
          revenue_type?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          collection_date?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          month?: number
          project_id?: string
          revenue_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          category: string
          closed_date: string | null
          created_at: string
          description: string | null
          financial_impact: number
          id: string
          identified_date: string | null
          impact: string
          mitigation_plan: string | null
          owner: string | null
          portfolio_id: string | null
          probability: string
          project_id: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          closed_date?: string | null
          created_at?: string
          description?: string | null
          financial_impact?: number
          id?: string
          identified_date?: string | null
          impact?: string
          mitigation_plan?: string | null
          owner?: string | null
          portfolio_id?: string | null
          probability?: string
          project_id?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          category?: string
          closed_date?: string | null
          created_at?: string
          description?: string | null
          financial_impact?: number
          id?: string
          identified_date?: string | null
          impact?: string
          mitigation_plan?: string | null
          owner?: string | null
          portfolio_id?: string | null
          probability?: string
          project_id?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"]
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"]
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"]
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit: {
        Args: {
          _scope_id: string
          _scope_type: Database["public"]["Enums"]["scope_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_access: {
        Args: {
          _scope_id: string
          _scope_type: Database["public"]["Enums"]["scope_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      scope_type: "system" | "company" | "project"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      scope_type: ["system", "company", "project"],
    },
  },
} as const
