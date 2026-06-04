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
      amenities_catalog: {
        Row: {
          category: Database["public"]["Enums"]["amenity_category"] | null
          display_order: number
          icon: string | null
          id: number
          is_active: boolean
          key: string
          label_es: string
          label_pt: string
          scope: Database["public"]["Enums"]["amenity_scope"]
        }
        Insert: {
          category?: Database["public"]["Enums"]["amenity_category"] | null
          display_order?: number
          icon?: string | null
          id: number
          is_active?: boolean
          key: string
          label_es: string
          label_pt: string
          scope: Database["public"]["Enums"]["amenity_scope"]
        }
        Update: {
          category?: Database["public"]["Enums"]["amenity_category"] | null
          display_order?: number
          icon?: string | null
          id?: number
          is_active?: boolean
          key?: string
          label_es?: string
          label_pt?: string
          scope?: Database["public"]["Enums"]["amenity_scope"]
        }
        Relationships: []
      }
      daily_usage_counters: {
        Row: {
          count: number
          metric: Database["public"]["Enums"]["usage_metric"]
          profile_id: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          count?: number
          metric?: Database["public"]["Enums"]["usage_metric"]
          profile_id: string
          updated_at?: string
          usage_date?: string
        }
        Update: {
          count?: number
          metric?: Database["public"]["Enums"]["usage_metric"]
          profile_id?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_usage_counters_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements_catalog: {
        Row: {
          created_at: string
          description: string
          key: Database["public"]["Enums"]["entitlement_key"]
          kind: Database["public"]["Enums"]["entitlement_kind"]
          unit: string | null
        }
        Insert: {
          created_at?: string
          description: string
          key: Database["public"]["Enums"]["entitlement_key"]
          kind: Database["public"]["Enums"]["entitlement_kind"]
          unit?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          key?: Database["public"]["Enums"]["entitlement_key"]
          kind?: Database["public"]["Enums"]["entitlement_kind"]
          unit?: string | null
        }
        Relationships: []
      }
      feed_events: {
        Row: {
          context: Json | null
          created_at: string
          dwell_ms: number | null
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id: number
          position: number | null
          property_id: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          dwell_ms?: number | null
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id?: never
          position?: number | null
          property_id?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          dwell_ms?: number | null
          event_type?: Database["public"]["Enums"]["feed_event_type"]
          id?: never
          position?: number | null
          property_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_items: {
        Row: {
          created_at: string
          folder_id: string
          note: string | null
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          note?: string | null
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          note?: string | null
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          item_count: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          item_count?: number
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          item_count?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_contacts: {
        Row: {
          agent_perf_summary: Json | null
          contact_email: string | null
          contact_form_enabled: boolean
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string
          property_id: string
          updated_at: string
        }
        Insert: {
          agent_perf_summary?: Json | null
          contact_email?: string | null
          contact_form_enabled?: boolean
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          property_id: string
          updated_at?: string
        }
        Update: {
          agent_perf_summary?: Json | null
          contact_email?: string | null
          contact_form_enabled?: boolean
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_details: {
        Row: {
          advertiser_type: Database["public"]["Enums"]["advertiser_type"]
          agency_logo_path: string | null
          agency_name: string | null
          broker_license: string | null
          broker_license_authority: string | null
          broker_name: string | null
          created_at: string
          listed_updated_at: string | null
          listing_code: string | null
          other_listings_count: number | null
          property_id: string
          published_at: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          advertiser_type?: Database["public"]["Enums"]["advertiser_type"]
          agency_logo_path?: string | null
          agency_name?: string | null
          broker_license?: string | null
          broker_license_authority?: string | null
          broker_name?: string | null
          created_at?: string
          listed_updated_at?: string | null
          listing_code?: string | null
          other_listings_count?: number | null
          property_id: string
          published_at?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          advertiser_type?: Database["public"]["Enums"]["advertiser_type"]
          agency_logo_path?: string | null
          agency_name?: string | null
          broker_license?: string | null
          broker_license_authority?: string | null
          broker_name?: string | null
          created_at?: string
          listed_updated_at?: string | null
          listing_code?: string | null
          other_listings_count?: number | null
          property_id?: string
          published_at?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          id: string
          is_anonymous: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_anonymous?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_anonymous?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line: string | null
          age_years: number | null
          apt_credit: boolean
          area_covered_sqm: number | null
          area_land_sqm: number | null
          area_semicovered_sqm: number | null
          area_sqm: number | null
          area_total_sqm: number | null
          area_uncovered_sqm: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          condition: Database["public"]["Enums"]["property_condition"] | null
          country: string | null
          cover_image_path: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          disposition: Database["public"]["Enums"]["disposition"] | null
          extra: Json | null
          floor_number: number | null
          half_bathrooms: number | null
          id: string
          is_new_construction: boolean
          is_under_construction: boolean
          like_count: number
          listing_type: Database["public"]["Enums"]["listing_type"]
          locale: string
          location: unknown
          metro_nearby: boolean
          orientation: Database["public"]["Enums"]["orientation"] | null
          owner_id: string | null
          parking_spaces: number
          postal_code: string | null
          price_cents: number
          property_kind: Database["public"]["Enums"]["property_kind"]
          published_at: string | null
          region: string | null
          rooms: number | null
          save_count: number
          search_tsv: unknown
          status: Database["public"]["Enums"]["listing_status"]
          suites: number | null
          title: string
          total_floors: number | null
          unit_levels: number | null
          updated_at: string
          year_built: number | null
        }
        Insert: {
          address_line?: string | null
          age_years?: number | null
          apt_credit?: boolean
          area_covered_sqm?: number | null
          area_land_sqm?: number | null
          area_semicovered_sqm?: number | null
          area_sqm?: number | null
          area_total_sqm?: number | null
          area_uncovered_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condition?: Database["public"]["Enums"]["property_condition"] | null
          country?: string | null
          cover_image_path?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          disposition?: Database["public"]["Enums"]["disposition"] | null
          extra?: Json | null
          floor_number?: number | null
          half_bathrooms?: number | null
          id?: string
          is_new_construction?: boolean
          is_under_construction?: boolean
          like_count?: number
          listing_type: Database["public"]["Enums"]["listing_type"]
          locale?: string
          location?: unknown
          metro_nearby?: boolean
          orientation?: Database["public"]["Enums"]["orientation"] | null
          owner_id?: string | null
          parking_spaces?: number
          postal_code?: string | null
          price_cents: number
          property_kind: Database["public"]["Enums"]["property_kind"]
          published_at?: string | null
          region?: string | null
          rooms?: number | null
          save_count?: number
          search_tsv?: unknown
          status?: Database["public"]["Enums"]["listing_status"]
          suites?: number | null
          title: string
          total_floors?: number | null
          unit_levels?: number | null
          updated_at?: string
          year_built?: number | null
        }
        Update: {
          address_line?: string | null
          age_years?: number | null
          apt_credit?: boolean
          area_covered_sqm?: number | null
          area_land_sqm?: number | null
          area_semicovered_sqm?: number | null
          area_sqm?: number | null
          area_total_sqm?: number | null
          area_uncovered_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condition?: Database["public"]["Enums"]["property_condition"] | null
          country?: string | null
          cover_image_path?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          disposition?: Database["public"]["Enums"]["disposition"] | null
          extra?: Json | null
          floor_number?: number | null
          half_bathrooms?: number | null
          id?: string
          is_new_construction?: boolean
          is_under_construction?: boolean
          like_count?: number
          listing_type?: Database["public"]["Enums"]["listing_type"]
          locale?: string
          location?: unknown
          metro_nearby?: boolean
          orientation?: Database["public"]["Enums"]["orientation"] | null
          owner_id?: string | null
          parking_spaces?: number
          postal_code?: string | null
          price_cents?: number
          property_kind?: Database["public"]["Enums"]["property_kind"]
          published_at?: string | null
          region?: string | null
          rooms?: number | null
          save_count?: number
          search_tsv?: unknown
          status?: Database["public"]["Enums"]["listing_status"]
          suites?: number | null
          title?: string
          total_floors?: number | null
          unit_levels?: number | null
          updated_at?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_amenities: {
        Row: {
          amenity_id: number
          available: boolean
          created_at: string
          property_id: string
          value: string | null
        }
        Insert: {
          amenity_id: number
          available?: boolean
          created_at?: string
          property_id: string
          value?: string | null
        }
        Update: {
          amenity_id?: number
          available?: boolean
          created_at?: string
          property_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_amenities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_attributes: {
        Row: {
          attr_key: string
          created_at: string
          property_id: string
          unit: string | null
          value_bool: boolean | null
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          attr_key: string
          created_at?: string
          property_id: string
          unit?: string | null
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          attr_key?: string
          created_at?: string
          property_id?: string
          unit?: string | null
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_attributes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_costs: {
        Row: {
          amount_cents: number
          cost_type: Database["public"]["Enums"]["cost_type"]
          created_at: string
          currency: string
          display_order: number
          id: string
          included: boolean
          is_estimate: boolean
          label: string | null
          period: Database["public"]["Enums"]["cost_period"]
          property_id: string
        }
        Insert: {
          amount_cents: number
          cost_type: Database["public"]["Enums"]["cost_type"]
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          included?: boolean
          is_estimate?: boolean
          label?: string | null
          period: Database["public"]["Enums"]["cost_period"]
          property_id: string
        }
        Update: {
          amount_cents?: number
          cost_type?: Database["public"]["Enums"]["cost_type"]
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          included?: boolean
          is_estimate?: boolean
          label?: string | null
          period?: Database["public"]["Enums"]["cost_period"]
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_costs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          created_at: string
          height: number | null
          id: string
          position: number
          property_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          height?: number | null
          id?: string
          position?: number
          property_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          height?: number | null
          id?: string
          position?: number
          property_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          created_at: string
          external_url: string | null
          height: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          position: number
          property_id: string
          storage_path: string | null
          thumbnail_path: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          external_url?: string | null
          height?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          position?: number
          property_id: string
          storage_path?: string | null
          thumbnail_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          created_at?: string
          external_url?: string | null
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          position?: number
          property_id?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_pois: {
        Row: {
          created_at: string
          display_order: number
          distance_m: number | null
          id: string
          location: unknown
          name: string
          poi_type: Database["public"]["Enums"]["poi_type"]
          property_id: string
          walk_minutes: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          distance_m?: number | null
          id?: string
          location?: unknown
          name: string
          poi_type: Database["public"]["Enums"]["poi_type"]
          property_id: string
          walk_minutes?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          distance_m?: number | null
          id?: string
          location?: unknown
          name?: string
          poi_type?: Database["public"]["Enums"]["poi_type"]
          property_id?: string
          walk_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_pois_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_price_events: {
        Row: {
          created_at: string
          currency: string | null
          event_type: Database["public"]["Enums"]["price_event_type"]
          id: string
          note: string | null
          occurred_at: string
          price_cents: number | null
          property_id: string
          status: Database["public"]["Enums"]["listing_status"] | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          event_type: Database["public"]["Enums"]["price_event_type"]
          id?: string
          note?: string | null
          occurred_at?: string
          price_cents?: number | null
          property_id: string
          status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          event_type?: Database["public"]["Enums"]["price_event_type"]
          id?: string
          note?: string | null
          occurred_at?: string
          price_cents?: number | null
          property_id?: string
          status?: Database["public"]["Enums"]["listing_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "property_price_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_reels: {
        Row: {
          aspect_ratio: number
          caption: string | null
          created_at: string
          duration_ms: number | null
          id: string
          image_paths: string[] | null
          is_primary: boolean
          media_type: Database["public"]["Enums"]["reel_media_type"]
          position: number
          poster_path: string | null
          property_id: string
          status: Database["public"]["Enums"]["reel_status"]
          thumbnail_blurhash: string | null
          updated_at: string
          video_path: string | null
        }
        Insert: {
          aspect_ratio?: number
          caption?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          image_paths?: string[] | null
          is_primary?: boolean
          media_type: Database["public"]["Enums"]["reel_media_type"]
          position?: number
          poster_path?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["reel_status"]
          thumbnail_blurhash?: string | null
          updated_at?: string
          video_path?: string | null
        }
        Update: {
          aspect_ratio?: number
          caption?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          image_paths?: string[] | null
          is_primary?: boolean
          media_type?: Database["public"]["Enums"]["reel_media_type"]
          position?: number
          poster_path?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["reel_status"]
          thumbnail_blurhash?: string | null
          updated_at?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_reels_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_terms: {
        Row: {
          accepts_fgts: boolean | null
          accepts_financing: boolean | null
          advance_months: number | null
          apt_credit: boolean | null
          apt_professional: boolean | null
          available_from: string | null
          created_at: string
          credit_check_required: boolean | null
          deposit_months: number | null
          guarantee_types:
            | Database["public"]["Enums"]["guarantee_type"][]
            | null
          is_furnished: Database["public"]["Enums"]["furnished_state"] | null
          min_income_cents: number | null
          min_income_note: string | null
          min_term_months: number | null
          notary_estimate_cents: number | null
          pets_allowed: boolean | null
          property_id: string
          title_status: string | null
          transfer_tax_estimate_cents: number | null
          updated_at: string
          utilities_included: boolean | null
        }
        Insert: {
          accepts_fgts?: boolean | null
          accepts_financing?: boolean | null
          advance_months?: number | null
          apt_credit?: boolean | null
          apt_professional?: boolean | null
          available_from?: string | null
          created_at?: string
          credit_check_required?: boolean | null
          deposit_months?: number | null
          guarantee_types?:
            | Database["public"]["Enums"]["guarantee_type"][]
            | null
          is_furnished?: Database["public"]["Enums"]["furnished_state"] | null
          min_income_cents?: number | null
          min_income_note?: string | null
          min_term_months?: number | null
          notary_estimate_cents?: number | null
          pets_allowed?: boolean | null
          property_id: string
          title_status?: string | null
          transfer_tax_estimate_cents?: number | null
          updated_at?: string
          utilities_included?: boolean | null
        }
        Update: {
          accepts_fgts?: boolean | null
          accepts_financing?: boolean | null
          advance_months?: number | null
          apt_credit?: boolean | null
          apt_professional?: boolean | null
          available_from?: string | null
          created_at?: string
          credit_check_required?: boolean | null
          deposit_months?: number | null
          guarantee_types?:
            | Database["public"]["Enums"]["guarantee_type"][]
            | null
          is_furnished?: Database["public"]["Enums"]["furnished_state"] | null
          min_income_cents?: number | null
          min_income_note?: string | null
          min_term_months?: number | null
          notary_estimate_cents?: number | null
          pets_allowed?: boolean | null
          property_id?: string
          title_status?: string | null
          transfer_tax_estimate_cents?: number | null
          updated_at?: string
          utilities_included?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "property_terms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          entitlement_ids: string[]
          environment: string | null
          id: string
          is_lifetime: boolean
          is_trial: boolean
          last_event_at: string | null
          last_event_id: string | null
          product_id: string | null
          profile_id: string
          rc_app_user_id: string | null
          rc_original_app_user_id: string | null
          status: Database["public"]["Enums"]["sub_status"]
          store: Database["public"]["Enums"]["sub_store"] | null
          tier: Database["public"]["Enums"]["app_tier"]
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_used: boolean
          updated_at: string
          will_renew: boolean
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          entitlement_ids?: string[]
          environment?: string | null
          id?: string
          is_lifetime?: boolean
          is_trial?: boolean
          last_event_at?: string | null
          last_event_id?: string | null
          product_id?: string | null
          profile_id: string
          rc_app_user_id?: string | null
          rc_original_app_user_id?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          store?: Database["public"]["Enums"]["sub_store"] | null
          tier?: Database["public"]["Enums"]["app_tier"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_used?: boolean
          updated_at?: string
          will_renew?: boolean
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          entitlement_ids?: string[]
          environment?: string | null
          id?: string
          is_lifetime?: boolean
          is_trial?: boolean
          last_event_at?: string | null
          last_event_id?: string | null
          product_id?: string | null
          profile_id?: string
          rc_app_user_id?: string | null
          rc_original_app_user_id?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          store?: Database["public"]["Enums"]["sub_store"] | null
          tier?: Database["public"]["Enums"]["app_tier"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_used?: boolean
          updated_at?: string
          will_renew?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_entitlements: {
        Row: {
          enabled: boolean
          entitlement_key: Database["public"]["Enums"]["entitlement_key"]
          is_unlimited: boolean
          level_value: string | null
          limit_int: number | null
          tier: Database["public"]["Enums"]["app_tier"]
        }
        Insert: {
          enabled?: boolean
          entitlement_key: Database["public"]["Enums"]["entitlement_key"]
          is_unlimited?: boolean
          level_value?: string | null
          limit_int?: number | null
          tier: Database["public"]["Enums"]["app_tier"]
        }
        Update: {
          enabled?: boolean
          entitlement_key?: Database["public"]["Enums"]["entitlement_key"]
          is_unlimited?: boolean
          level_value?: string | null
          limit_int?: number | null
          tier?: Database["public"]["Enums"]["app_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "tier_entitlements_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlements_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      trial_grants: {
        Row: {
          device_fingerprint: string | null
          granted_at: string
          id: string
          identity_fingerprint: string
          profile_id: string | null
        }
        Insert: {
          device_fingerprint?: string | null
          granted_at?: string
          id?: string
          identity_fingerprint: string
          profile_id?: string | null
        }
        Update: {
          device_fingerprint?: string | null
          granted_at?: string
          id?: string
          identity_fingerprint?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          app_user_id: string
          event_ts: number | null
          event_type: string
          id: string
          payload: Json
          rc_event_id: string
          received_at: string
          status: string | null
        }
        Insert: {
          app_user_id: string
          event_ts?: number | null
          event_type: string
          id?: string
          payload: Json
          rc_event_id: string
          received_at?: string
          status?: string | null
        }
        Update: {
          app_user_id?: string
          event_ts?: number | null
          event_type?: string
          id?: string
          payload?: Json
          rc_event_id?: string
          received_at?: string
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dev_grant_entitlement: {
        Args: {
          p_tier: Database["public"]["Enums"]["app_tier"]
          p_user: string
        }
        Returns: undefined
      }
      enforce_quota: {
        Args: {
          p_current: number
          p_key: Database["public"]["Enums"]["entitlement_key"]
          p_user: string
        }
        Returns: undefined
      }
      get_listing_contact: { Args: { p_property_id: string }; Returns: Json }
      get_my_entitlements: {
        Args: never
        Returns: {
          enabled: boolean
          is_unlimited: boolean
          key: Database["public"]["Enums"]["entitlement_key"]
          kind: Database["public"]["Enums"]["entitlement_kind"]
          level_value: string
          limit_int: number
        }[]
      }
      is_property_visible: { Args: { p_property_id: string }; Returns: boolean }
      is_storage_object_visible: { Args: { p_name: string }; Returns: boolean }
      owns_folder: { Args: { p_folder_id: string }; Returns: boolean }
      owns_property: { Args: { p_property_id: string }; Returns: boolean }
      purge_soft_deleted: { Args: { p_retention?: string }; Returns: undefined }
      ranked_feed: {
        Args: { p_limit?: number }
        Returns: {
          address_line: string | null
          age_years: number | null
          apt_credit: boolean
          area_covered_sqm: number | null
          area_land_sqm: number | null
          area_semicovered_sqm: number | null
          area_sqm: number | null
          area_total_sqm: number | null
          area_uncovered_sqm: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          condition: Database["public"]["Enums"]["property_condition"] | null
          country: string | null
          cover_image_path: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          disposition: Database["public"]["Enums"]["disposition"] | null
          extra: Json | null
          floor_number: number | null
          half_bathrooms: number | null
          id: string
          is_new_construction: boolean
          is_under_construction: boolean
          like_count: number
          listing_type: Database["public"]["Enums"]["listing_type"]
          locale: string
          location: unknown
          metro_nearby: boolean
          orientation: Database["public"]["Enums"]["orientation"] | null
          owner_id: string | null
          parking_spaces: number
          postal_code: string | null
          price_cents: number
          property_kind: Database["public"]["Enums"]["property_kind"]
          published_at: string | null
          region: string | null
          rooms: number | null
          save_count: number
          search_tsv: unknown
          status: Database["public"]["Enums"]["listing_status"]
          suites: number | null
          title: string
          total_floors: number | null
          unit_levels: number | null
          updated_at: string
          year_built: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "properties"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      recompute_cover_image: {
        Args: { p_property_id: string }
        Returns: undefined
      }
      reconcile_counters: { Args: never; Returns: undefined }
      record_swipe: {
        Args: never
        Returns: {
          allowed: boolean
          day_limit: number
          unlimited: boolean
          used: number
        }[]
      }
      resolve_entitlement: {
        Args: {
          p_key: Database["public"]["Enums"]["entitlement_key"]
          p_user: string
        }
        Returns: {
          enabled: boolean
          is_unlimited: boolean
          level_value: string
          limit_int: number
        }[]
      }
      start_ultimate_trial: {
        Args: { p_device_fingerprint?: string; p_identity_fingerprint: string }
        Returns: {
          eligible: boolean
          reason: string
          trial_ends_at: string
        }[]
      }
    }
    Enums: {
      advertiser_type: "agency" | "owner" | "managed"
      amenity_category:
        | "comfort"
        | "security"
        | "leisure"
        | "services"
        | "sustainability"
        | "connectivity"
        | "accessibility"
      amenity_scope: "unit" | "building"
      app_tier: "free" | "pro" | "ultimate" | "top"
      cost_period: "monthly" | "yearly" | "once"
      cost_type:
        | "rent"
        | "sale_price"
        | "expensas"
        | "condominio"
        | "iptu"
        | "abl"
        | "seguro_incendio"
        | "taxa_servico"
        | "deposit"
        | "itbi"
        | "notary"
        | "registry"
        | "agency_fee"
        | "other"
      disposition: "frente" | "contrafrente" | "interno" | "lateral"
      entitlement_key:
        | "swipes_per_day"
        | "max_favorites"
        | "max_folders"
        | "max_saved_searches"
        | "filters_geo_amenity"
        | "rewind"
        | "no_ads"
        | "premium_agent_data"
        | "saved_search_alerts"
        | "instant_listing_alerts"
        | "fresh_listings_first"
        | "priority_support"
      entitlement_kind: "quota" | "boolean" | "level"
      feed_event_type:
        | "view"
        | "detail"
        | "like"
        | "unlike"
        | "pass"
        | "save"
        | "unsave"
        | "super_like"
        | "rewind"
        | "share"
      furnished_state: "unfurnished" | "semi" | "furnished"
      guarantee_type:
        | "garantia_propietaria"
        | "fianza"
        | "seguro_caucion"
        | "recibo_sueldo"
        | "fiador"
        | "seguro_fianca"
        | "caucao"
        | "institutional_none"
      listing_status: "active" | "pending" | "sold" | "rented" | "hidden"
      listing_type: "buy" | "rent"
      media_type: "virtual_tour_3d" | "floor_plan" | "drone" | "map_embed"
      orientation: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
      poi_type:
        | "transit_subway"
        | "transit_train"
        | "transit_bus"
        | "education"
        | "health"
        | "park"
        | "shopping"
        | "other"
      price_event_type:
        | "listed"
        | "price_changed"
        | "status_changed"
        | "relisted"
        | "delisted"
      property_condition:
        | "new"
        | "excellent"
        | "very_good"
        | "good"
        | "to_renovate"
        | "reciclado"
      property_kind: "house" | "apartment" | "studio" | "land" | "commercial"
      reel_media_type: "video" | "image_set"
      reel_status: "processing" | "ready" | "hidden"
      sub_status:
        | "active"
        | "in_grace"
        | "past_due"
        | "paused"
        | "canceled"
        | "expired"
        | "inactive"
      sub_store:
        | "app_store"
        | "play_store"
        | "stripe"
        | "paddle"
        | "promotional"
      usage_metric: "swipe"
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
    Enums: {
      advertiser_type: ["agency", "owner", "managed"],
      amenity_category: [
        "comfort",
        "security",
        "leisure",
        "services",
        "sustainability",
        "connectivity",
        "accessibility",
      ],
      amenity_scope: ["unit", "building"],
      app_tier: ["free", "pro", "ultimate", "top"],
      cost_period: ["monthly", "yearly", "once"],
      cost_type: [
        "rent",
        "sale_price",
        "expensas",
        "condominio",
        "iptu",
        "abl",
        "seguro_incendio",
        "taxa_servico",
        "deposit",
        "itbi",
        "notary",
        "registry",
        "agency_fee",
        "other",
      ],
      disposition: ["frente", "contrafrente", "interno", "lateral"],
      entitlement_key: [
        "swipes_per_day",
        "max_favorites",
        "max_folders",
        "max_saved_searches",
        "filters_geo_amenity",
        "rewind",
        "no_ads",
        "premium_agent_data",
        "saved_search_alerts",
        "instant_listing_alerts",
        "fresh_listings_first",
        "priority_support",
      ],
      entitlement_kind: ["quota", "boolean", "level"],
      feed_event_type: [
        "view",
        "detail",
        "like",
        "unlike",
        "pass",
        "save",
        "unsave",
        "super_like",
        "rewind",
        "share",
      ],
      furnished_state: ["unfurnished", "semi", "furnished"],
      guarantee_type: [
        "garantia_propietaria",
        "fianza",
        "seguro_caucion",
        "recibo_sueldo",
        "fiador",
        "seguro_fianca",
        "caucao",
        "institutional_none",
      ],
      listing_status: ["active", "pending", "sold", "rented", "hidden"],
      listing_type: ["buy", "rent"],
      media_type: ["virtual_tour_3d", "floor_plan", "drone", "map_embed"],
      orientation: ["n", "s", "e", "w", "ne", "nw", "se", "sw"],
      poi_type: [
        "transit_subway",
        "transit_train",
        "transit_bus",
        "education",
        "health",
        "park",
        "shopping",
        "other",
      ],
      price_event_type: [
        "listed",
        "price_changed",
        "status_changed",
        "relisted",
        "delisted",
      ],
      property_condition: [
        "new",
        "excellent",
        "very_good",
        "good",
        "to_renovate",
        "reciclado",
      ],
      property_kind: ["house", "apartment", "studio", "land", "commercial"],
      reel_media_type: ["video", "image_set"],
      reel_status: ["processing", "ready", "hidden"],
      sub_status: [
        "active",
        "in_grace",
        "past_due",
        "paused",
        "canceled",
        "expired",
        "inactive",
      ],
      sub_store: ["app_store", "play_store", "stripe", "paddle", "promotional"],
      usage_metric: ["swipe"],
    },
  },
} as const

