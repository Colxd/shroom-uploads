-- Supabase Database Setup for Shroom Uploads
-- Run this in your Supabase SQL Editor

-- Create the files table
CREATE TABLE IF NOT EXISTS files (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    type VARCHAR(100),
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    download_url TEXT NOT NULL,
    storage_ref VARCHAR(255) NOT NULL,
    share_id VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_upload_date ON files(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_files_share_id ON files(share_id);

-- Enable Row Level Security (RLS)
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (for demo purposes)
-- In production, you should create more restrictive policies
CREATE POLICY "Allow all operations on files" ON files
    FOR ALL USING (true);

-- Create storage bucket for file uploads
-- Note: This needs to be done through the Supabase Dashboard
-- Go to Storage > Create a new bucket called "uploads"
-- Set it to public for demo purposes

-- Optional: Create a function to automatically generate share_id
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN substr(md5(random()::text), 1, 12);
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

CREATE TRIGGER set_share_id_trigger
    BEFORE INSERT ON files
    FOR EACH ROW
    EXECUTE FUNCTION set_share_id();
