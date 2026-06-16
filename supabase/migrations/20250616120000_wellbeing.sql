-- Wellbeing surveys (Discord PoC)

create type public.wellbeing_pillar as enum (
  'workload',
  'climate',
  'wellbeing',
  'recognition'
);

create type public.wellbeing_relationship as enum ('peer', 'leader');

create type public.wellbeing_session_status as enum (
  'in_progress',
  'completed',
  'abandoned'
);

create type public.wellbeing_campaign_status as enum (
  'draft',
  'active',
  'closed'
);

create type public.wellbeing_submission_source as enum ('encuesta', 'campaign');

create table public.wellbeing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default 'Encuesta de bienestar',
  status public.wellbeing_campaign_status not null default 'draft',
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index wellbeing_campaigns_org_status_idx on public.wellbeing_campaigns (
  organization_id,
  status
);

create table public.wellbeing_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.wellbeing_campaigns (id) on delete set null,
  discord_thread_key text not null,
  status public.wellbeing_session_status not null default 'in_progress',
  current_step text not null default 'consent',
  state jsonb not null default '{}'::jsonb,
  source public.wellbeing_submission_source not null default 'encuesta',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index wellbeing_sessions_profile_status_idx on public.wellbeing_sessions (
  profile_id,
  status
);

create unique index wellbeing_sessions_in_progress_unique on public.wellbeing_sessions (
  profile_id,
  discord_thread_key
) where status = 'in_progress';

create table public.wellbeing_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.wellbeing_sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.wellbeing_campaigns (id) on delete set null,
  source public.wellbeing_submission_source not null,
  completed_at timestamptz not null default now()
);

create unique index wellbeing_submissions_one_per_campaign on public.wellbeing_submissions (
  profile_id,
  campaign_id
) where campaign_id is not null;

create index wellbeing_submissions_org_completed_idx on public.wellbeing_submissions (
  organization_id,
  completed_at desc
);

create table public.wellbeing_pillar_ratings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wellbeing_submissions (id) on delete cascade,
  pillar public.wellbeing_pillar not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  unique (submission_id, pillar)
);

create table public.wellbeing_person_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wellbeing_submissions (id) on delete cascade,
  evaluator_profile_id uuid not null references public.profiles (id) on delete cascade,
  evaluatee_name text not null,
  relationship public.wellbeing_relationship not null,
  rating smallint not null check (rating between 1 and 5),
  comment text
);

create index wellbeing_person_evaluations_submission_idx on public.wellbeing_person_evaluations (
  submission_id
);

alter table public.wellbeing_campaigns enable row level security;
alter table public.wellbeing_sessions enable row level security;
alter table public.wellbeing_submissions enable row level security;
alter table public.wellbeing_pillar_ratings enable row level security;
alter table public.wellbeing_person_evaluations enable row level security;

-- wellbeing_campaigns
create policy wellbeing_campaigns_select on public.wellbeing_campaigns for select using (
  public.is_superadmin ()
  or organization_id = public.current_organization_id ()
);

create policy wellbeing_campaigns_manage on public.wellbeing_campaigns for all using (
  public.can_manage_organization (organization_id)
) with check (public.can_manage_organization (organization_id));

-- wellbeing_sessions (members read/write own)
create policy wellbeing_sessions_select on public.wellbeing_sessions for select using (
  public.is_superadmin ()
  or profile_id = auth.uid ()
  or public.can_manage_organization (organization_id)
);

create policy wellbeing_sessions_insert on public.wellbeing_sessions for insert
with check (profile_id = auth.uid () or public.is_superadmin ());

create policy wellbeing_sessions_update on public.wellbeing_sessions for update using (
  profile_id = auth.uid () or public.is_superadmin ()
);

-- wellbeing_submissions
create policy wellbeing_submissions_select on public.wellbeing_submissions for select using (
  public.is_superadmin ()
  or profile_id = auth.uid ()
  or public.can_manage_organization (organization_id)
);

create policy wellbeing_submissions_insert on public.wellbeing_submissions for insert
with check (profile_id = auth.uid () or public.is_superadmin ());

-- wellbeing_pillar_ratings (via submission ownership or org admin)
create policy wellbeing_pillar_ratings_select on public.wellbeing_pillar_ratings for select using (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (
        s.profile_id = auth.uid ()
        or public.is_superadmin ()
        or public.can_manage_organization (s.organization_id)
      )
  )
);

create policy wellbeing_pillar_ratings_insert on public.wellbeing_pillar_ratings for insert
with check (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (s.profile_id = auth.uid () or public.is_superadmin ())
  )
);

-- wellbeing_person_evaluations
create policy wellbeing_person_evaluations_select on public.wellbeing_person_evaluations for select using (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (
        s.profile_id = auth.uid ()
        or public.is_superadmin ()
        or public.can_manage_organization (s.organization_id)
      )
  )
);

create policy wellbeing_person_evaluations_insert on public.wellbeing_person_evaluations for insert
with check (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (s.profile_id = auth.uid () or public.is_superadmin ())
  )
);
