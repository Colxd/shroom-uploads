# Supabase Setup Guide for Shroom Uploads

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Give your project a name (e.g., "shroom-uploads")
5. Set a database password (save this!)
6. Choose a region close to you
7. Click "Create new project"

## Step 2: Set Up Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy and paste the contents of `supabase-setup.sql`
3. Click "Run" to execute the SQL

## Step 3: Create Storage Bucket

1. Go to **Storage** in the left sidebar
2. Click **"Create a new bucket"**
3. Name it `uploads`
4. Set it to **Public** (for demo purposes)
5. Click **"Create bucket"**

## Step 4: Get Your Credentials

1. Go to **Settings** → **API**
2. Copy your **Project URL** and **anon public** key
3. Update the credentials in your `index.html` file:

```javascript
const supabaseUrl = 'YOUR_PROJECT_URL_HERE'
const supabaseKey = 'YOUR_ANON_KEY_HERE'
```

## Step 5: Update Your HTML

Replace the placeholder values in your `index.html` file:

```javascript
// Replace these with your actual Supabase project credentials
const supabaseUrl = 'https://your-project-id.supabase.co'
const supabaseKey = 'your-anon-key-here'
```

## Step 6: Test Your Setup

1. Open your `index.html` file in a browser
2. Try uploading a file
3. Check if it appears in your files list
4. Test the download functionality

## Troubleshooting

### Common Issues:

1. **"Supabase not initialized" error**
   - Check that your credentials are correct
   - Make sure the Supabase SDK is loaded

2. **Upload fails**
   - Verify your storage bucket is created and public
   - Check browser console for error messages

3. **Files don't load**
   - Verify your database table was created
   - Check that RLS policies are set correctly

### Security Notes:

- The current setup allows all operations for demo purposes
- For production, create more restrictive RLS policies
- Consider adding user authentication

## Supabase Free Tier Limits

- **Database**: 500MB
- **Storage**: 1GB
- **File uploads**: 50MB max per file
- **API calls**: 50,000 per month

## Next Steps

1. Test file uploads and downloads
2. Customize the UI as needed
3. Add user authentication if required
4. Set up proper security policies for production
