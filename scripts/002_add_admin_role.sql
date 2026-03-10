-- Add admin role to profiles table
-- Run this migration to enable admin functionality

-- Add is_admin column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Create index for admin lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Create admin-specific policies (admins can read all data)
-- Note: These policies use service role key on the server, so we create admin API routes instead

-- Create a function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$;

-- Optional: Grant admin access to a specific user by email
-- UPDATE public.profiles SET is_admin = true WHERE email = 'your-admin@email.com';
