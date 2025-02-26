/*
 # Create profiles table and security policies
 
 1. New Tables
 - `profiles`
 - `id` (uuid, primary key, references auth.users)
 - `full_name` (text)
 - `group_id` (text, references groups)
 - `created_at` (timestamp with time zone)
 - `updated_at` (timestamp with time zone)
 
 2. Security
 - Enable RLS on `profiles` table
 - Add policies for:
 - Users can read their own profile
 - Users can update their own profile
 - New profiles can be created on user signup
 */
-- Create groups table
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

INSERT INTO
  groups (name)
VALUES
  ('Tech'),
  ('Marketing'),
  ('Finance'),
  ('HR');

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  group_name TEXT NOT NULL REFERENCES groups(name),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE
  profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  groups ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON profiles FOR
SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles FOR
UPDATE
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles FOR
INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Anonymous can view groups" ON groups FOR
SELECT
  TO public USING (true);

CREATE POLICY "Users can view own group" ON groups TO authenticated USING (
  (
    name IN (
      SELECT
        profiles.group_name
      FROM
        profiles
      WHERE
        (profiles.id = auth.uid())
    )
  )
);

-- Create function to handle updated_at
CREATE
OR REPLACE FUNCTION handle_updated_at() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = now();

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE
UPDATE
  ON profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_net";

CREATE EXTENSION IF NOT EXISTS "http";

-- Create storage schema
CREATE SCHEMA IF NOT EXISTS storage;

-- Create storage tables
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT FALSE,
  avif_autodetection boolean DEFAULT FALSE,
  file_size_limit bigint,
  allowed_mime_types text []
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets,
  name text,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text [] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);

-- Create storage policies
ALTER TABLE
  storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON storage.objects FOR
SELECT
  TO authenticated USING (bucket_id = 'filestorage');

CREATE POLICY "Allow authenticated insert access" ON storage.objects FOR
INSERT
  TO authenticated WITH CHECK (bucket_id = 'filestorage');

CREATE POLICY "Allow authenticated delete access" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'filestorage'
  AND owner = auth.uid()
);

CREATE
OR REPLACE FUNCTION storage.foldername(name text) RETURNS text [] LANGUAGE plpgsql AS $ $ BEGIN RETURN string_to_array(name, '/');

END $ $;

-- Initialize storage bucket
INSERT INTO
  storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
VALUES
  (
    'filestorage',
    'filestorage',
    true,
    5242880,
    -- 5MB limit
    ARRAY ['application/pdf'] :: text []
  ) ON CONFLICT (id) DO
UPDATE
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY ['application/pdf'] :: text [],
  updated_at = now();

-- Create transaction table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  pdf_name TEXT NOT NULL,
  user_name TEXT NOT NULL,
  upload_date TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE
  transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own transactions" ON transactions FOR
SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Enable insert for authenticated users only" ON "public"."transactions" AS PERMISSIVE FOR
INSERT
  TO authenticated WITH CHECK (true);