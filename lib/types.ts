export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      daily_ad_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number
          cpc: number | null
          cpm: number | null
          ctr: number | null
          currency: string
          date: string
          impressions: number
          objective: string | null
          reach: number
          spend: number
          status: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency: string
          date: string
          impressions?: number
          objective?: string | null
          reach?: number
          spend?: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency?: string
          date?: string
          impressions?: number
          objective?: string | null
          reach?: number
          spend?: number
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_ad_spend: {
        Row: {
          ad_account_id: string
          clicks: number
          cpc: number | null
          cpm: number | null
          ctr: number | null
          currency: string
          date: string
          frequency: number | null
          impressions: number
          meta_purchases: number
          meta_revenue: number
          reach: number
          source: string
          spend: number
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency: string
          date: string
          frequency?: number | null
          impressions?: number
          meta_purchases?: number
          meta_revenue?: number
          reach?: number
          source?: string
          spend?: number
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency?: string
          date?: string
          frequency?: number | null
          impressions?: number
          meta_purchases?: number
          meta_revenue?: number
          reach?: number
          source?: string
          spend?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_products: {
        Row: {
          date: string
          gross_sales: number
          net_sales: number
          orders: number
          product_id: string
          product_title: string
          units: number
          updated_at: string
        }
        Insert: {
          date: string
          gross_sales?: number
          net_sales?: number
          orders?: number
          product_id: string
          product_title: string
          units?: number
          updated_at?: string
        }
        Update: {
          date?: string
          gross_sales?: number
          net_sales?: number
          orders?: number
          product_id?: string
          product_title?: string
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_sales: {
        Row: {
          aov: number | null
          currency: string
          customers: number
          date: string
          discounts: number
          gross_sales: number
          net_sales: number
          new_customers: number
          orders: number
          returning_customers: number
          returns: number
          shipping: number
          taxes: number
          total_sales: number
          updated_at: string
        }
        Insert: {
          aov?: number | null
          currency: string
          customers?: number
          date: string
          discounts?: number
          gross_sales?: number
          net_sales?: number
          new_customers?: number
          orders?: number
          returning_customers?: number
          returns?: number
          shipping?: number
          taxes?: number
          total_sales?: number
          updated_at?: string
        }
        Update: {
          aov?: number | null
          currency?: string
          customers?: number
          date?: string
          discounts?: number
          gross_sales?: number
          net_sales?: number
          new_customers?: number
          orders?: number
          returning_customers?: number
          returns?: number
          shipping?: number
          taxes?: number
          total_sales?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_traffic: {
        Row: {
          conversion_rate: number | null
          date: string
          sessions: number
          sessions_completed_checkout: number
          sessions_reached_checkout: number
          sessions_with_cart: number
          updated_at: string
          visitors: number
        }
        Insert: {
          conversion_rate?: number | null
          date: string
          sessions?: number
          sessions_completed_checkout?: number
          sessions_reached_checkout?: number
          sessions_with_cart?: number
          updated_at?: string
          visitors?: number
        }
        Update: {
          conversion_rate?: number | null
          date?: string
          sessions?: number
          sessions_completed_checkout?: number
          sessions_reached_checkout?: number
          sessions_with_cart?: number
          updated_at?: string
          visitors?: number
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base_currency: string
          date: string
          fetched_at: string
          quote_currency: string
          rate: number
        }
        Insert: {
          base_currency: string
          date: string
          fetched_at?: string
          quote_currency: string
          rate: number
        }
        Update: {
          base_currency?: string
          date?: string
          fetched_at?: string
          quote_currency?: string
          rate?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          date_from: string | null
          date_to: string | null
          error: string | null
          finished_at: string | null
          id: number
          rows_written: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          finished_at?: string | null
          id?: number
          rows_written?: number
          source: string
          started_at?: string
          status: string
        }
        Update: {
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          finished_at?: string | null
          id?: number
          rows_written?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      daily_metrics: {
        Row: {
          ad_account_id: string | null
          ad_currency: string | null
          ad_source: string | null
          ad_spend: number | null
          ad_spend_original: number | null
          ad_spend_pct: number | null
          aov: number | null
          cac: number | null
          clicks: number | null
          contribution: number | null
          conversion_rate: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          customers: number | null
          date: string | null
          discounts: number | null
          frequency: number | null
          gross_sales: number | null
          impressions: number | null
          mer: number | null
          meta_purchases: number | null
          meta_revenue: number | null
          net_sales: number | null
          new_customers: number | null
          orders: number | null
          reach: number | null
          returning_customers: number | null
          returns: number | null
          roas: number | null
          sessions: number | null
          sessions_completed_checkout: number | null
          sessions_reached_checkout: number | null
          sessions_with_cart: number | null
          shipping: number | null
          store_currency: string | null
          taxes: number | null
          total_sales: number | null
          visitors: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

