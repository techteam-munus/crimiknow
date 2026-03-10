-- CrimiKnow Database Schema
-- Includes: profiles, subscriptions, usage tracking for monetization

-- ============================================
-- PROFILES TABLE
-- Stores user profile information
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- ============================================
-- SUBSCRIPTION TIERS TABLE
-- Defines available subscription plans
-- ============================================
create table if not exists public.subscription_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price_monthly decimal(10,2) not null default 0,
  price_yearly decimal(10,2) not null default 0,
  queries_per_month int not null default 10,
  features jsonb default '[]'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Insert default subscription tiers
insert into public.subscription_tiers (name, description, price_monthly, price_yearly, queries_per_month, features) values
  ('free', 'Free Plan - Limited access', 0, 0, 10, '["10 queries per month", "Basic criminal law questions", "Standard response time"]'::jsonb),
  ('basic', 'Basic Plan - For casual users', 299, 2990, 100, '["100 queries per month", "All criminal law topics", "Priority response time", "Chat history"]'::jsonb),
  ('professional', 'Professional Plan - For legal professionals', 799, 7990, 500, '["500 queries per month", "All criminal law topics", "Fastest response time", "Chat history", "Export conversations", "Priority support"]'::jsonb),
  ('unlimited', 'Unlimited Plan - Unlimited access', 1499, 14990, -1, '["Unlimited queries", "All criminal law topics", "Fastest response time", "Chat history", "Export conversations", "Priority support", "API access"]'::jsonb)
on conflict (name) do nothing;

-- ============================================
-- USER SUBSCRIPTIONS TABLE
-- Tracks user subscription status
-- ============================================
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers(id),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired', 'pending')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

alter table public.user_subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.user_subscriptions;
drop policy if exists "subscriptions_insert_own" on public.user_subscriptions;
drop policy if exists "subscriptions_update_own" on public.user_subscriptions;

create policy "subscriptions_select_own" on public.user_subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on public.user_subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on public.user_subscriptions for update using (auth.uid() = user_id);

-- ============================================
-- USAGE TRACKING TABLE
-- Tracks query usage for billing/limits
-- ============================================
create table if not exists public.usage_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query_count int not null default 0,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.usage_tracking enable row level security;

drop policy if exists "usage_select_own" on public.usage_tracking;
drop policy if exists "usage_insert_own" on public.usage_tracking;
drop policy if exists "usage_update_own" on public.usage_tracking;

create policy "usage_select_own" on public.usage_tracking for select using (auth.uid() = user_id);
create policy "usage_insert_own" on public.usage_tracking for insert with check (auth.uid() = user_id);
create policy "usage_update_own" on public.usage_tracking for update using (auth.uid() = user_id);

-- ============================================
-- CHAT HISTORY TABLE
-- Stores conversation history (for paid users)
-- ============================================
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions_select_own" on public.chat_sessions;
drop policy if exists "chat_sessions_insert_own" on public.chat_sessions;
drop policy if exists "chat_sessions_update_own" on public.chat_sessions;
drop policy if exists "chat_sessions_delete_own" on public.chat_sessions;

create policy "chat_sessions_select_own" on public.chat_sessions for select using (auth.uid() = user_id);
create policy "chat_sessions_insert_own" on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy "chat_sessions_update_own" on public.chat_sessions for update using (auth.uid() = user_id);
create policy "chat_sessions_delete_own" on public.chat_sessions for delete using (auth.uid() = user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_own" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;

create policy "chat_messages_select_own" on public.chat_messages for select using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages for insert with check (auth.uid() = user_id);

-- ============================================
-- PAYMENT HISTORY TABLE
-- For future payment integration
-- ============================================
create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.user_subscriptions(id),
  amount decimal(10,2) not null,
  currency text default 'PHP',
  payment_method text,
  payment_provider text,
  provider_transaction_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz default now()
);

alter table public.payment_history enable row level security;

drop policy if exists "payments_select_own" on public.payment_history;

create policy "payments_select_own" on public.payment_history for select using (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_tier_id uuid;
begin
  -- Get the free tier ID
  select id into free_tier_id from public.subscription_tiers where name = 'free' limit 1;
  
  -- Create profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  
  -- Assign free subscription
  insert into public.user_subscriptions (user_id, tier_id, current_period_end)
  values (
    new.id,
    free_tier_id,
    now() + interval '1 month'
  )
  on conflict (user_id) do nothing;
  
  -- Initialize usage tracking for current month
  insert into public.usage_tracking (user_id, period_start, period_end)
  values (
    new.id,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================
-- INDEXES for performance
-- ============================================
create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_usage_tracking_user_id on public.usage_tracking(user_id);
create index if not exists idx_usage_tracking_period on public.usage_tracking(period_start, period_end);
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_messages_session_id on public.chat_messages(session_id);
