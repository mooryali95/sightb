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
    PostgrestVersion: "14.5"
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
      budget_amendments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          project_id: string
          reason: string
          snapshot_after: Json | null
          snapshot_before: Json
          status: string
          total_after: number | null
          total_before: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          project_id: string
          reason: string
          snapshot_after?: Json | null
          snapshot_before?: Json
          status?: string
          total_after?: number | null
          total_before?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          project_id?: string
          reason?: string
          snapshot_after?: Json | null
          snapshot_before?: Json
          status?: string
          total_after?: number | null
          total_before?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      cash_transfer_repairs: {
        Row: {
          after_snapshot: Json
          amount: number
          before_snapshot: Json
          created_at: string
          custody_id: string | null
          custody_name: string | null
          id: string
          missing_fund_id: string | null
          performed_by: string
          performed_by_email: string | null
          project_id: string
          reason: string
          transfer_date: string | null
          transfer_id: string
        }
        Insert: {
          after_snapshot?: Json
          amount: number
          before_snapshot?: Json
          created_at?: string
          custody_id?: string | null
          custody_name?: string | null
          id?: string
          missing_fund_id?: string | null
          performed_by: string
          performed_by_email?: string | null
          project_id: string
          reason: string
          transfer_date?: string | null
          transfer_id: string
        }
        Update: {
          after_snapshot?: Json
          amount?: number
          before_snapshot?: Json
          created_at?: string
          custody_id?: string | null
          custody_name?: string | null
          id?: string
          missing_fund_id?: string | null
          performed_by?: string
          performed_by_email?: string | null
          project_id?: string
          reason?: string
          transfer_date?: string | null
          transfer_id?: string
        }
        Relationships: []
      }
      cash_transfers: {
        Row: {
          amount: number
          created_at: string
          from_fund_id: string
          id: string
          notes: string | null
          project_id: string
          to_custody_id: string
          transfer_date: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          from_fund_id: string
          id?: string
          notes?: string | null
          project_id: string
          to_custody_id: string
          transfer_date?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_fund_id?: string
          id?: string
          notes?: string | null
          project_id?: string
          to_custody_id?: string
          transfer_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_to_custody_id_fkey"
            columns: ["to_custody_id"]
            isOneToOne: false
            referencedRelation: "custodies"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          amount_impact: number
          approved_by: string | null
          approved_date: string | null
          auto_rebaseline: boolean | null
          budget_items_json: Json | null
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
          auto_rebaseline?: boolean | null
          budget_items_json?: Json | null
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
          auto_rebaseline?: boolean | null
          budget_items_json?: Json | null
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
      commitments: {
        Row: {
          budget_item_id: string | null
          contract_ref: string | null
          created_at: string
          description: string
          end_date: string | null
          id: string
          notes: string | null
          project_id: string
          spent_amount: number
          start_date: string | null
          status: string
          total_amount: number
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          budget_item_id?: string | null
          contract_ref?: string | null
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id: string
          spent_amount?: number
          start_date?: string | null
          status?: string
          total_amount?: number
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          budget_item_id?: string | null
          contract_ref?: string | null
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          spent_amount?: number
          start_date?: string | null
          status?: string
          total_amount?: number
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitments_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_project_id_fkey"
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
          closed_date: string | null
          company_id: string | null
          created_at: string
          id: string
          notes: string | null
          project_id: string | null
          received_date: string | null
          resource_name: string
          source_fund_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          closed_date?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          received_date?: string | null
          resource_name: string
          source_fund_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          closed_date?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          received_date?: string | null
          resource_name?: string
          source_fund_id?: string | null
          status?: string
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
          {
            foreignKeyName: "custodies_source_fund_id_fkey"
            columns: ["source_fund_id"]
            isOneToOne: false
            referencedRelation: "project_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approval_status: string
          approved_by: string | null
          budget_item_id: string | null
          category: string
          commitment_id: string | null
          created_at: string
          custody_id: string | null
          date: string
          description: string
          fund_id: string | null
          id: string
          invoice_ref: string | null
          is_vat_exempt: boolean | null
          legacy_pre_fund: boolean
          month: number
          notes: string | null
          ocr_extracted_data: Json | null
          project_id: string
          receipt_attachments: Json
          reimburses_payable_id: string | null
          resource_id: string | null
          responsible: string | null
          source_payment_request_id: string | null
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          approval_status?: string
          approved_by?: string | null
          budget_item_id?: string | null
          category: string
          commitment_id?: string | null
          created_at?: string
          custody_id?: string | null
          date: string
          description: string
          fund_id?: string | null
          id?: string
          invoice_ref?: string | null
          is_vat_exempt?: boolean | null
          legacy_pre_fund?: boolean
          month?: number
          notes?: string | null
          ocr_extracted_data?: Json | null
          project_id: string
          receipt_attachments?: Json
          reimburses_payable_id?: string | null
          resource_id?: string | null
          responsible?: string | null
          source_payment_request_id?: string | null
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          approval_status?: string
          approved_by?: string | null
          budget_item_id?: string | null
          category?: string
          commitment_id?: string | null
          created_at?: string
          custody_id?: string | null
          date?: string
          description?: string
          fund_id?: string | null
          id?: string
          invoice_ref?: string | null
          is_vat_exempt?: boolean | null
          legacy_pre_fund?: boolean
          month?: number
          notes?: string | null
          ocr_extracted_data?: Json | null
          project_id?: string
          receipt_attachments?: Json
          reimburses_payable_id?: string | null
          resource_id?: string | null
          responsible?: string | null
          source_payment_request_id?: string | null
          user_id?: string
          vendor?: string | null
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
            foreignKeyName: "expenses_reimburses_payable_id_fkey"
            columns: ["reimburses_payable_id"]
            isOneToOne: false
            referencedRelation: "resource_reimbursements"
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
      fund_settlements: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          attachments: Json
          created_at: string
          difference: number | null
          difference_reason: string | null
          fund_id: string
          id: string
          project_id: string
          rejection_reason: string | null
          remaining_cash: number
          settled_by: string | null
          settlement_date: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          total_received: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          attachments?: Json
          created_at?: string
          difference?: number | null
          difference_reason?: string | null
          fund_id: string
          id?: string
          project_id: string
          rejection_reason?: string | null
          remaining_cash?: number
          settled_by?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_received?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          attachments?: Json
          created_at?: string
          difference?: number | null
          difference_reason?: string | null
          fund_id?: string
          id?: string
          project_id?: string
          rejection_reason?: string | null
          remaining_cash?: number
          settled_by?: string | null
          settlement_date?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_received?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_settlements_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: true
            referencedRelation: "project_funds"
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
      passkey_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      passkey_login_challenges: {
        Row: {
          challenge: string
          client: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          challenge: string
          client?: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
        }
        Update: {
          challenge?: string
          client?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      passkey_step_up_codes: {
        Row: {
          code_hash: string
          confirmed_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          session_id: string | null
          used_at: string | null
          user_id: string
          wrong_attempts: number
        }
        Insert: {
          code_hash: string
          confirmed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          session_id?: string | null
          used_at?: string | null
          user_id: string
          wrong_attempts?: number
        }
        Update: {
          code_hash?: string
          confirmed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          session_id?: string | null
          used_at?: string | null
          user_id?: string
          wrong_attempts?: number
        }
        Relationships: []
      }
      passkeys: {
        Row: {
          backed_up: boolean
          can_sign_in: boolean
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          discoverable: boolean | null
          id: string
          last_used_at: string | null
          name: string
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          backed_up?: boolean
          can_sign_in?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          discoverable?: boolean | null
          id?: string
          last_used_at?: string | null
          name: string
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          backed_up?: boolean
          can_sign_in?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          discoverable?: boolean | null
          id?: string
          last_used_at?: string | null
          name?: string
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          advance_settled_at: string | null
          advance_settled_by: string | null
          amount: number
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          auto_created_expense_id: string | null
          budget_item_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          is_advance_outstanding: boolean
          justification: string | null
          linked_fund_id: string | null
          linked_reimbursement_ids: Json
          paid_date: string | null
          paid_from_custody_id: string | null
          paid_from_fund_id: string | null
          payment_attachments: Json
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          priority: Database["public"]["Enums"]["payment_priority"]
          project_id: string
          refund_to_custody_id: string | null
          refund_to_fund_id: string | null
          refunded_amount: number
          rejection_reason: string | null
          request_type: Database["public"]["Enums"]["payment_request_type"]
          requested_at: string | null
          requested_by: string
          resource_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_date: string | null
          settled_amount: number | null
          settlement_notes: string | null
          settlement_type:
            | Database["public"]["Enums"]["advance_settlement_type"]
            | null
          status: Database["public"]["Enums"]["payment_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          advance_settled_at?: string | null
          advance_settled_by?: string | null
          amount?: number
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_created_expense_id?: string | null
          budget_item_id?: string | null
          created_at?: string
          currency?: string
          description: string
          id?: string
          is_advance_outstanding?: boolean
          justification?: string | null
          linked_fund_id?: string | null
          linked_reimbursement_ids?: Json
          paid_date?: string | null
          paid_from_custody_id?: string | null
          paid_from_fund_id?: string | null
          payment_attachments?: Json
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          priority?: Database["public"]["Enums"]["payment_priority"]
          project_id: string
          refund_to_custody_id?: string | null
          refund_to_fund_id?: string | null
          refunded_amount?: number
          rejection_reason?: string | null
          request_type?: Database["public"]["Enums"]["payment_request_type"]
          requested_at?: string | null
          requested_by: string
          resource_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date?: string | null
          settled_amount?: number | null
          settlement_notes?: string | null
          settlement_type?:
            | Database["public"]["Enums"]["advance_settlement_type"]
            | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          advance_settled_at?: string | null
          advance_settled_by?: string | null
          amount?: number
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_created_expense_id?: string | null
          budget_item_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_advance_outstanding?: boolean
          justification?: string | null
          linked_fund_id?: string | null
          linked_reimbursement_ids?: Json
          paid_date?: string | null
          paid_from_custody_id?: string | null
          paid_from_fund_id?: string | null
          payment_attachments?: Json
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          priority?: Database["public"]["Enums"]["payment_priority"]
          project_id?: string
          refund_to_custody_id?: string | null
          refund_to_fund_id?: string | null
          refunded_amount?: number
          rejection_reason?: string | null
          request_type?: Database["public"]["Enums"]["payment_request_type"]
          requested_at?: string | null
          requested_by?: string
          resource_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date?: string | null
          settled_amount?: number | null
          settlement_notes?: string | null
          settlement_type?:
            | Database["public"]["Enums"]["advance_settlement_type"]
            | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      project_funds: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          created_at: string
          created_by: string
          fund_number: number
          id: string
          notes: string | null
          project_id: string
          status: Database["public"]["Enums"]["fund_status"]
          transfer_date: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          amount?: number
          created_at?: string
          created_by: string
          fund_number: number
          id?: string
          notes?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["fund_status"]
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          amount?: number
          created_at?: string
          created_by?: string
          fund_number?: number
          id?: string
          notes?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["fund_status"]
          transfer_date?: string
          updated_at?: string
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
          tax_percent: number | null
          user_id: string
          vat_inclusive: boolean | null
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
          tax_percent?: number | null
          user_id: string
          vat_inclusive?: boolean | null
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
          tax_percent?: number | null
          user_id?: string
          vat_inclusive?: boolean | null
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
      resource_reimbursements: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          budget_item_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          notes: string | null
          payment_request_id: string | null
          project_id: string
          receipt_attachments: Json
          rejection_reason: string | null
          resource_id: string | null
          settled_at: string | null
          settled_expense_id: string | null
          source_kind: string
          status: Database["public"]["Enums"]["reimbursement_status"]
          updated_at: string
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          budget_item_id?: string | null
          category: string
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_request_id?: string | null
          project_id: string
          receipt_attachments?: Json
          rejection_reason?: string | null
          resource_id?: string | null
          settled_at?: string | null
          settled_expense_id?: string | null
          source_kind?: string
          status?: Database["public"]["Enums"]["reimbursement_status"]
          updated_at?: string
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          budget_item_id?: string | null
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_request_id?: string | null
          project_id?: string
          receipt_attachments?: Json
          rejection_reason?: string | null
          resource_id?: string | null
          settled_at?: string | null
          settled_expense_id?: string | null
          source_kind?: string
          status?: Database["public"]["Enums"]["reimbursement_status"]
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_reimbursements_settled_expense_id_fkey"
            columns: ["settled_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_settlements: {
        Row: {
          balance: number
          created_at: string
          created_by: string
          id: string
          linked_payment_ids: Json
          linked_reimbursement_ids: Json
          notes: string | null
          period_from: string | null
          period_to: string | null
          project_id: string | null
          resource_id: string
          settlement_text_ar: string | null
          signature_attachment: string | null
          signed_at: string | null
          signed_by_resource: boolean
          status: Database["public"]["Enums"]["resource_settlement_status"]
          total_owed: number
          total_paid: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          created_by: string
          id?: string
          linked_payment_ids?: Json
          linked_reimbursement_ids?: Json
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          project_id?: string | null
          resource_id: string
          settlement_text_ar?: string | null
          signature_attachment?: string | null
          signed_at?: string | null
          signed_by_resource?: boolean
          status?: Database["public"]["Enums"]["resource_settlement_status"]
          total_owed?: number
          total_paid?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          created_by?: string
          id?: string
          linked_payment_ids?: Json
          linked_reimbursement_ids?: Json
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          project_id?: string | null
          resource_id?: string
          settlement_text_ar?: string | null
          signature_attachment?: string | null
          signed_at?: string | null
          signed_by_resource?: boolean
          status?: Database["public"]["Enums"]["resource_settlement_status"]
          total_owed?: number
          total_paid?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          milestone_id: string | null
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
          milestone_id?: string | null
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
          milestone_id?: string | null
          month?: number
          project_id?: string
          revenue_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
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
      second_factor_devices: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      second_factor_settings: {
        Row: {
          enforce: boolean
          id: number
          updated_at: string
        }
        Insert: {
          enforce?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          enforce?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      session_second_factor: {
        Row: {
          method: string
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          method: string
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          method?: string
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      settlement_events: {
        Row: {
          amount: number
          budget_item_id: string | null
          created_at: string
          created_by: string
          event_type: Database["public"]["Enums"]["settlement_event_type"]
          expense_category: string | null
          expense_id: string | null
          id: string
          notes: string | null
          overflow_expense_id: string | null
          payment_request_id: string
          project_id: string
          refund_to_custody_id: string | null
          refund_to_fund_id: string | null
          reversed_event_id: string | null
        }
        Insert: {
          amount: number
          budget_item_id?: string | null
          created_at?: string
          created_by: string
          event_type: Database["public"]["Enums"]["settlement_event_type"]
          expense_category?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          overflow_expense_id?: string | null
          payment_request_id: string
          project_id: string
          refund_to_custody_id?: string | null
          refund_to_fund_id?: string | null
          reversed_event_id?: string | null
        }
        Update: {
          amount?: number
          budget_item_id?: string | null
          created_at?: string
          created_by?: string
          event_type?: Database["public"]["Enums"]["settlement_event_type"]
          expense_category?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          overflow_expense_id?: string | null
          payment_request_id?: string
          project_id?: string
          refund_to_custody_id?: string | null
          refund_to_fund_id?: string | null
          reversed_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_events_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_overflow_expense_id_fkey"
            columns: ["overflow_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_reversed_event_id_fkey"
            columns: ["reversed_event_id"]
            isOneToOne: false
            referencedRelation: "settlement_events"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          fingerprint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
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
      can_access_expense_receipt: { Args: { _path: string }; Returns: boolean }
      can_access_resource_receipt: { Args: { _path: string }; Returns: boolean }
      can_edit: {
        Args: {
          _scope_id: string
          _scope_type: Database["public"]["Enums"]["scope_type"]
          _user_id: string
        }
        Returns: boolean
      }
      custody_snapshot: { Args: { _custody_id: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      explain_attachment_access: { Args: { _path: string }; Returns: Json }
      fund_total_spent: { Args: { _fund_id: string }; Returns: number }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      passkey_step_up_verify: {
        Args: { p_code_hash: string; p_session_id: string; p_user_id: string }
        Returns: string
      }
      plpgsql_block_begin: { Args: { body: string }; Returns: number }
      project_financial_summary: {
        Args: { _project_id: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      repair_orphan_cash_transfer: {
        Args: { _reason: string; _transfer_id: string }
        Returns: Json
      }
      require_second_factor: { Args: never; Returns: undefined }
      second_factor_ok: { Args: never; Returns: boolean }
      second_factor_required: { Args: { p_user_id: string }; Returns: boolean }
      split_settle_advance: {
        Args: {
          _budget_item_id: string
          _category: string
          _date: string
          _description: string
          _month: number
          _notes: string
          _overflow_amount: number
          _overflow_custody_id: string
          _overflow_fund_id: string
          _overflow_source: string
          _payment_request_id: string
          _settle_amount: number
        }
        Returns: Json
      }
      ssot_explain: {
        Args: { _key: string; _project_id: string }
        Returns: Json
      }
    }
    Enums: {
      advance_settlement_type:
        | "documented"
        | "cash_refund"
        | "payroll_deduction"
        | "written_off"
      app_role: "admin" | "editor" | "viewer" | "owner"
      fund_status: "transferred" | "acknowledged" | "settled" | "pending_next"
      payment_method: "bank_transfer" | "cash" | "check" | "card"
      payment_priority: "normal" | "urgent" | "critical"
      payment_request_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "scheduled"
        | "paid"
        | "cancelled"
      payment_request_type:
        | "reimbursement"
        | "salary"
        | "bonus"
        | "advance"
        | "fund_top_up"
        | "other"
      reimbursement_status:
        | "pending_review"
        | "approved"
        | "reimbursed"
        | "rejected"
      resource_settlement_status: "draft" | "signed" | "disputed" | "cancelled"
      scope_type: "system" | "company" | "project"
      settlement_event_type:
        | "cash_refund"
        | "documented"
        | "payroll_deduction"
        | "written_off"
        | "reverse"
      settlement_status: "draft" | "submitted" | "approved" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      advance_settlement_type: [
        "documented",
        "cash_refund",
        "payroll_deduction",
        "written_off",
      ],
      app_role: ["admin", "editor", "viewer", "owner"],
      fund_status: ["transferred", "acknowledged", "settled", "pending_next"],
      payment_method: ["bank_transfer", "cash", "check", "card"],
      payment_priority: ["normal", "urgent", "critical"],
      payment_request_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "scheduled",
        "paid",
        "cancelled",
      ],
      payment_request_type: [
        "reimbursement",
        "salary",
        "bonus",
        "advance",
        "fund_top_up",
        "other",
      ],
      reimbursement_status: [
        "pending_review",
        "approved",
        "reimbursed",
        "rejected",
      ],
      resource_settlement_status: ["draft", "signed", "disputed", "cancelled"],
      scope_type: ["system", "company", "project"],
      settlement_event_type: [
        "cash_refund",
        "documented",
        "payroll_deduction",
        "written_off",
        "reverse",
      ],
      settlement_status: ["draft", "submitted", "approved", "rejected"],
    },
  },
} as const
