-- Supabase Database Setup for Shroom Uploads
-- Run this in your Supabase SQL Editor

-- Drop existing table if it exists (for clean setup)
DROP TABLE IF EXISTS files CASCADE;

-- Create the files table with folder support
CREATE TABLE IF NOT EXISTS files (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    type VARCHAR(100) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    download_url TEXT NOT NULL,
    storage_ref VARCHAR(255) NOT NULL,
    share_id VARCHAR(50) UNIQUE NOT NULL,
    folder_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_share_id ON files(share_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_files_upload_date ON files(upload_date);
CREATE INDEX IF NOT EXISTS idx_files_folder_path ON files(folder_path);

-- Enable Row Level Security (RLS)
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create a permissive policy for all operations (you can make this more restrictive later)
CREATE POLICY "Allow all operations on files" ON files
    FOR ALL USING (true);

-- Optional: Create a function to generate share IDs
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN encode(gen_random_bytes(12), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a trigger to automatically generate share_id if not provided
CREATE OR REPLACE FUNCTION set_share_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.share_id IS NULL THEN
        NEW.share_id := generate_share_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_share_id
    BEFORE INSERT ON files
    FOR EACH ROW
    EXECUTE FUNCTION set_share_id();
