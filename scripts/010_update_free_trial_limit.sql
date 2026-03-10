-- Update free tier to 5 questions (was 10)
UPDATE subscription_tiers 
SET queries_per_month = 5,
    description = '5 questions free trial'
WHERE name = 'free';
