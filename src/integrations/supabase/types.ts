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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          retainer_hours: number
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          retainer_hours?: number
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          retainer_hours?: number
        }
        Relationships: []
      }
      hour_credits: {
        Row: {
          client_id: string
          created_at: string
          effective_month: string | null
          hours: number
          id: string
          kind: string
          note: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          effective_month?: string | null
          hours: number
          id?: string
          kind?: string
          note?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          effective_month?: string | null
          hours?: number
          id?: string
          kind?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hour_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_assignments: boolean
          email_comments: boolean
          email_mentions: boolean
          email_status: boolean
          inapp_assignments: boolean
          inapp_comments: boolean
          inapp_mentions: boolean
          inapp_status: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_assignments?: boolean
          email_comments?: boolean
          email_mentions?: boolean
          email_status?: boolean
          inapp_assignments?: boolean
          inapp_comments?: boolean
          inapp_mentions?: boolean
          inapp_status?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_assignments?: boolean
          email_comments?: boolean
          email_mentions?: boolean
          email_status?: boolean
          inapp_assignments?: boolean
          inapp_comments?: boolean
          inapp_mentions?: boolean
          inapp_status?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          task_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          task_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          task_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          client_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          size_bytes: number | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          size_bytes?: number | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comment_edits: {
        Row: {
          comment_id: string
          created_at: string
          edited_by: string | null
          id: string
          old_body: string
          parent_id: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          edited_by?: string | null
          id?: string
          old_body: string
          parent_id?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          old_body?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_followers: {
        Row: {
          task_id: string
          user_id: string
        }
        Insert: {
          task_id: string
          user_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_followers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_owners: {
        Row: {
          task_id: string
          user_id: string
        }
        Insert: {
          task_id: string
          user_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_owners_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          owner_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          owner_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          owner_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          limit_override: boolean
          minutes: number | null
          note: string | null
          override_minutes: number | null
          started_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          limit_override?: boolean
          minutes?: number | null
          note?: string | null
          override_minutes?: number | null
          started_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          limit_override?: boolean
          minutes?: number | null
          note?: string | null
          override_minutes?: number | null
          started_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          ended_at: string | null
          entry_user_id: string | null
          id: string
          limit_override: boolean
          note: string | null
          override_minutes: number | null
          raw_minutes: number | null
          rounded_minutes: number | null
          rounding_delta_minutes: number | null
          started_at: string | null
          task_id: string
          time_entry_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          ended_at?: string | null
          entry_user_id?: string | null
          id?: string
          limit_override?: boolean
          note?: string | null
          override_minutes?: number | null
          raw_minutes?: number | null
          rounded_minutes?: number | null
          rounding_delta_minutes?: number | null
          started_at?: string | null
          task_id: string
          time_entry_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          ended_at?: string | null
          entry_user_id?: string | null
          id?: string
          limit_override?: boolean
          note?: string | null
          override_minutes?: number | null
          raw_minutes?: number | null
          rounded_minutes?: number | null
          rounding_delta_minutes?: number | null
          started_at?: string | null
          task_id?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_audit_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      visible_profiles: {
        Row: {
          avatar_url: string | null
          client_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          client_id?: never
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          client_id?: never
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_see_task: { Args: { _task_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      my_client_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "member" | "client"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "requested"
        | "in_progress"
        | "review"
        | "completed"
        | "on_hold"
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
      app_role: ["admin", "member", "client"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "requested",
        "in_progress",
        "review",
        "completed",
        "on_hold",
      ],
    },
  },
} as const
