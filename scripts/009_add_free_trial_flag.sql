-- Add has_used_free_trial flag to profiles to prevent re-enrollment
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS has_used_free_trial boolean DEFAULT false;

-- Mark all existing users as having used their free trial (they already got one on sign-up)
UPDATE public.profiles SET has_used_free_trial = true WHERE has_used_free_trial IS NULL OR has_used_free_trial = false;

-- Update the handle_new_user trigger to set the flag on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_tier_id uuid;
BEGIN
  -- Get the free tier ID
  SELECT id INTO free_tier_id FROM public.subscription_tiers WHERE name = 'free' LIMIT 1;
  
  -- Create profile with free trial flag set
  INSERT INTO public.profiles (id, email, full_name, has_used_free_trial)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', null),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Assign free subscription
  INSERT INTO public.user_subscriptions (user_id, tier_id, current_period_end)
  VALUES (
    new.id,
    free_tier_id,
    now() + interval '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Initialize usage tracking for current month
  INSERT INTO public.usage_tracking (user_id, period_start, period_end)
  VALUES (
    new.id,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month'
  );

  RETURN new;
END;
$$;
