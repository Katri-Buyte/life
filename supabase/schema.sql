-- Life app: budget tables.
-- Run once in the Supabase SQL editor of your project.
-- Every row belongs to the signed-in user, and row level security makes sure
-- nobody else can read or change it, even with the public anon key.

create table if not exists public.budget_categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  color text not null,
  icon text not null,
  budget_cents integer not null default 0 check (budget_cents >= 0),
  sort integer not null default 0
);

create table if not exists public.budget_transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  amount_cents integer not null check (amount_cents > 0),
  kind text not null check (kind in ('expense', 'income')),
  category_id uuid not null references public.budget_categories (id),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists budget_transactions_user_date on public.budget_transactions (user_id, date desc);

alter table public.budget_categories enable row level security;
alter table public.budget_transactions enable row level security;

drop policy if exists "own categories" on public.budget_categories;
create policy "own categories" on public.budget_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own transactions" on public.budget_transactions;
create policy "own transactions" on public.budget_transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Vault: savings inside the budget section.

create table if not exists public.vault_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salary_cents integer not null default 0 check (salary_cents >= 0),
  goal_cents integer not null default 0 check (goal_cents >= 0),
  starting_cents integer not null default 0 check (starting_cents >= 0)
);

-- amount_cents is positive for money added and negative for money taken out.
create table if not exists public.vault_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  amount_cents integer not null check (amount_cents <> 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists vault_entries_user_date on public.vault_entries (user_id, date desc);

alter table public.vault_settings enable row level security;
alter table public.vault_entries enable row level security;

drop policy if exists "own vault settings" on public.vault_settings;
create policy "own vault settings" on public.vault_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own vault entries" on public.vault_entries;
create policy "own vault entries" on public.vault_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Signed-in users may use these tables through the API (the policies above
-- still limit them to their own rows). People who are not signed in get nothing.
grant select, insert, update, delete on
  public.budget_categories, public.budget_transactions, public.vault_settings, public.vault_entries
  to authenticated;
revoke all on
  public.budget_categories, public.budget_transactions, public.vault_settings, public.vault_entries
  from anon;

-- Subscriptions (added 2026-11-23). handled_month is the last month ('YYYY-MM')
-- whose payment was logged or skipped from the app.

create table if not exists public.subscriptions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount_cents integer not null check (amount_cents > 0),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  day integer not null check (day between 1 and 31),
  month integer not null check (month between 1 and 12),
  category_id uuid not null references public.budget_categories (id),
  handled_month text not null default '',
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "own subscriptions" on public.subscriptions;
create policy "own subscriptions" on public.subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.subscriptions to authenticated;
revoke all on public.subscriptions from anon;

-- Journal (added 2026-11-23): routines and one-off tasks, what was done or
-- skipped each day, a daily check-in, and how many minutes feel like a full day.

create table if not exists public.journal_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  type text not null,
  days integer[] not null default '{}',   -- routines: weekdays, Monday = 1 ... Sunday = 7
  date date,                              -- one-off tasks: the day it is planned for
  part text not null default 'anytime' check (part in ('morning', 'afternoon', 'evening', 'anytime')),
  minutes integer not null default 0 check (minutes between 0 and 600),
  created_at timestamptz not null default now()
);

create table if not exists public.journal_marks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.journal_items (id) on delete cascade,
  date date not null,
  status text not null check (status in ('done', 'skipped')),
  unique (user_id, item_id, date)
);

create table if not exists public.journal_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  energy integer check (energy between 1 and 5),
  mood text not null default '',
  note text not null default '',
  primary key (user_id, date)
);

create table if not exists public.journal_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  capacity_minutes integer not null default 120 check (capacity_minutes between 10 and 1440)
);

alter table public.journal_items enable row level security;
alter table public.journal_marks enable row level security;
alter table public.journal_days enable row level security;
alter table public.journal_settings enable row level security;

drop policy if exists "own journal items" on public.journal_items;
create policy "own journal items" on public.journal_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own journal marks" on public.journal_marks;
create policy "own journal marks" on public.journal_marks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own journal days" on public.journal_days;
create policy "own journal days" on public.journal_days for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own journal settings" on public.journal_settings;
create policy "own journal settings" on public.journal_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.journal_items, public.journal_marks, public.journal_days, public.journal_settings to authenticated;
revoke all on public.journal_items, public.journal_marks, public.journal_days, public.journal_settings from anon;

-- Wishlist (added 2026-11-23). bought_on is set when an item is marked as bought;
-- transaction_id points to the expense logged for it, if any.

create table if not exists public.wishlist_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  url text not null default '',
  price_cents integer check (price_cents >= 0),
  priority text not null default 'want' check (priority in ('need', 'want', 'someday')),
  note text not null default '',
  bought_on date,
  transaction_id uuid,
  created_at timestamptz not null default now()
);

alter table public.wishlist_items enable row level security;

drop policy if exists "own wishlist" on public.wishlist_items;
create policy "own wishlist" on public.wishlist_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.wishlist_items to authenticated;
revoke all on public.wishlist_items from anon;

-- Diary (added 2026-11-23): daily trackers and answers to the diary questions
-- live on the same row as that day's check-in; goals for the trackers live in
-- journal_settings.

alter table public.journal_days add column if not exists trackers jsonb not null default '{}'::jsonb;
alter table public.journal_days add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.journal_settings add column if not exists goals jsonb not null default '{}'::jsonb;

-- Bills (added 2026-11-23): bills share the subscriptions table. A bill can vary in
-- amount (amount_cents is then an estimate) and can come every 2, 3, 4 or 6 months.

alter table public.subscriptions add column if not exists kind text not null default 'subscription' check (kind in ('subscription', 'bill'));
alter table public.subscriptions add column if not exists variable boolean not null default false;
alter table public.subscriptions add column if not exists every_months integer not null default 1 check (every_months in (1, 2, 3, 4, 6));

-- Bills added by hand (added 2026-11-23): cycle 'manual' has no payment date; each
-- bill is added as an expense when it arrives. Its typed amount is optional, so 0 is allowed.

alter table public.subscriptions drop constraint if exists subscriptions_cycle_check;
alter table public.subscriptions add constraint subscriptions_cycle_check check (cycle in ('monthly', 'yearly', 'manual'));
alter table public.subscriptions drop constraint if exists subscriptions_amount_cents_check;
alter table public.subscriptions add constraint subscriptions_amount_cents_check check (amount_cents >= 0);
