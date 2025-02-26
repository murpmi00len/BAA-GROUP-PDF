export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          group_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          group_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          group_name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      groups: {
        Row: {
          id?: string;
          name: "Tech" | "Marketing" | "Finance" | "HR";
        };
        Insert: {
          id?: string;
          name: "Tech" | "Marketing" | "Finance" | "HR";
        };
        Update: {
          id?: string;
          name?: "Tech" | "Marketing" | "Finance" | "HR";
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          user_name: string;
          pdf_name: string;
          upload_date: string;
        };
        Insert: {
          id: string;
          user_id: string;
          user_name: string;
          pdf_name: string;
          upload_date: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          user_name?: string;
          pdf_name?: string;
          upload_date?: string;
        };
      };
      storage_buckets: {
        Row: {
          id: string;
          name: string;
          owner?: string | null;
          created_at: string;
          updated_at: string;
          public: boolean;
          avif_autodetection: boolean;
          file_size_limit?: number | null;
          allowed_mime_types?: string[] | null;
        };
        Insert: {
          id: string;
          name: string;
          owner?: string | null;
          created_at?: string;
          updated_at?: string;
          public?: boolean;
          avif_autodetection?: boolean;
          file_size_limit?: number | null;
          allowed_mime_types?: string[] | null;
        };
        Update: {
          id?: string;
          name?: string;
          owner?: string | null;
          created_at?: string;
          updated_at?: string;
          public?: boolean;
          avif_autodetection?: boolean;
          file_size_limit?: number | null;
          allowed_mime_types?: string[] | null;
        };
      };
      storage_objects: {
        Row: {
          id: string;
          bucket_id: string;
          name: string;
          owner?: string | null;
          created_at: string;
          updated_at: string;
          last_accessed_at: string;
          metadata?: Record<string, any> | null;
          path_tokens: string[];
        };
        Insert: {
          id?: string;
          bucket_id: string;
          name: string;
          owner?: string | null;
          created_at?: string;
          updated_at?: string;
          last_accessed_at?: string;
          metadata?: Record<string, any> | null;
          path_tokens?: string[];
        };
        Update: {
          id?: string;
          bucket_id?: string;
          name?: string;
          owner?: string | null;
          created_at?: string;
          updated_at?: string;
          last_accessed_at?: string;
          metadata?: Record<string, any> | null;
          path_tokens?: string[];
        };
      };
    };
  };
}
