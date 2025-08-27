-- Supabase Database Setup for Shroom Uploads
-- Run this in your Supabase SQL Editor

-- Drop existing table if it exists
DROP TABLE IF EXISTS files CASCADE;

-- Create files table with enhanced features
CREATE TABLE files (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    type VARCHAR(100) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    download_url TEXT NOT NULL,
    storage_ref VARCHAR(255) NOT NULL,
    share_id VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    thumbnail_url TEXT,
    download_count INTEGER DEFAULT 0,
    last_downloaded TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_upload_date ON files(upload_date);
CREATE INDEX idx_files_share_id ON files(share_id);
CREATE INDEX idx_files_type ON files(type);

-- Enable Row Level Security
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own files" ON files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files" ON files
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- Allow public access to shared files (for share links)
CREATE POLICY "Public can view shared files" ON files
    FOR SELECT USING (share_id IS NOT NULL);

-- Function to generate share ID
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS VARCHAR(50) AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result VARCHAR(50) := '';
    i INTEGER := 0;
BEGIN
    FOR i IN 1..10 LOOP
        result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically generate share_id if not provided
CREATE OR REPLACE FUNCTION set_share_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.share_id IS NULL OR NEW.share_id = '' THEN
        NEW.share_id := generate_share_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_share_id
    BEFORE INSERT ON files
    FOR EACH ROW
    EXECUTE FUNCTION set_share_id();

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_download_count(file_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE files 
    SET download_count = download_count + 1,
        last_downloaded = NOW()
    WHERE id = file_id;
END;
$$ LANGUAGE plpgsql;

-- Create storage bucket for uploads
-- Note: This needs to be done in the Supabase dashboard
-- Go to Storage > Create bucket named 'uploads' with public access

-- Storage policies for the uploads bucket
-- These need to be set in the Supabase dashboard under Storage > Policies

-- Example storage policies to add:
-- 1. Allow authenticated users to upload files
-- 2. Allow public access to download files
-- 3. Allow users to delete their own files

-- Comments for manual setup:
/*
Storage Bucket Setup:
1. Go to Supabase Dashboard > Storage
2. Create a new bucket called 'uploads'
3. Set it to public
4. Add the following policies:

Policy 1: "Allow authenticated uploads"
- Operation: INSERT
- Target roles: authenticated
- Policy definition: true

Policy 2: "Allow public downloads"
- Operation: SELECT
- Target roles: public
- Policy definition: true

Policy 3: "Allow users to delete their own files"
- Operation: DELETE
- Target roles: authenticated
- Policy definition: bucket_id = 'uploads'

Policy 4: "Allow users to update their own files"
- Operation: UPDATE
- Target roles: authenticated
- Policy definition: bucket_id = 'uploads'
*/
