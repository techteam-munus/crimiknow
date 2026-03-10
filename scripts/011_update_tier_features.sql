-- Update subscription tier features to match current limits
UPDATE public.subscription_tiers
SET features = '["5 questions free trial", "All criminal law topics and penalties"]'::jsonb
WHERE name = 'free';

UPDATE public.subscription_tiers
SET features = '["100 queries per month", "All criminal law topics and penalties", "Chat history", "Export conversations", "Standard support"]'::jsonb
WHERE name = 'basic';

UPDATE public.subscription_tiers
SET features = '["500 queries per month", "All criminal law topics and penalties", "Chat history", "Export conversations", "Standard support"]'::jsonb
WHERE name = 'professional';

UPDATE public.subscription_tiers
SET features = '["Unlimited queries", "All criminal law topics and penalties", "Chat history", "Export conversations", "Priority support"]'::jsonb
WHERE name = 'unlimited';
