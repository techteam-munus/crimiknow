-- Add last_active column to profiles to track user login status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE;

-- Create index for efficient queries on last_active
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active DESC);

-- Update existing profiles to have last_active set to their updated_at or created_at
UPDATE profiles 
SET last_active = COALESCE(updated_at, created_at) 
WHERE last_active IS NULL;
