# Authentication Setup Guide

This application uses Google OAuth 2.0 for user authentication. Follow these steps to set up authentication.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. A Supabase database with a `users` table

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback` (for development)
     - `https://your-domain.com/api/auth/google/callback` (for production)
   - Save the Client ID and Client Secret

## Step 2: Update Supabase fathom_connections Table

The authentication data is stored in the existing `fathom_connections` table. Run this SQL migration in your Supabase SQL editor to add Google OAuth fields:

```sql
-- Add Google OAuth columns to existing fathom_connections table
ALTER TABLE public.fathom_connections
ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS picture TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_fathom_connections_google_id ON public.fathom_connections(google_id);
CREATE INDEX IF NOT EXISTS idx_fathom_connections_email ON public.fathom_connections(email);
```

**Note:** If you already have a separate `users` table, you can migrate the data:

```sql
-- Migrate data from users table to fathom_connections
UPDATE public.fathom_connections fc
SET 
  google_id = u.google_id,
  email = u.email,
  name = u.name,
  picture = u.picture
FROM public.users u
WHERE fc.user_id = u.user_id;

-- After migration, you can drop the users table
DROP TABLE IF EXISTS public.users;
```

## Step 3: Environment Variables

Add these environment variables to your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Session Secret (generate a random string)
SESSION_SECRET=your-random-session-secret-here

# App URL
APP_URL=http://localhost:3000  # or your production URL

# Existing Supabase and Fathom variables
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
FATHOM_CLIENT_ID=your-fathom-client-id
FATHOM_CLIENT_SECRET=your-fathom-client-secret
```

## Step 4: How It Works

1. **Landing Page**: Users see a landing page with a "Sign in with Google" button
2. **Google OAuth**: Clicking the button redirects to Google for authentication
3. **User Creation**: After successful authentication, the user is stored in the `fathom_connections` table with:
   - `user_id`: Format `google_{googleId}` (used for Fathom integration)
   - `google_id`: The Google user ID
   - `email`, `name`, `picture`: User profile information
   - `access_token`, `refresh_token`, `token_expires_at`: Fathom OAuth tokens (when connected)
4. **Session Management**: User session is maintained using express-session
5. **Fathom Integration**: The authenticated `user_id` is automatically used for Fathom OAuth and meeting syncing. Both Google auth and Fathom connection data are stored in the same table.

## Step 5: Testing

1. Start your server: `node server.js`
2. Navigate to `http://localhost:3000`
3. Click "Sign in with Google"
4. Complete the Google OAuth flow
5. You should be redirected to `/dashboard` with your authenticated session

## Notes

- The `user_id` format is `google_{googleId}` to ensure uniqueness
- Sessions expire after 24 hours
- Users can logout using the logout button in the dashboard header
- All API routes automatically use the authenticated user's ID from the session
-
