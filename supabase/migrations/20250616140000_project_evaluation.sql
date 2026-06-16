-- Project evaluation campaign type and response tables

create type public.wellbeing_campaign_type as enum ('wellbeing', 'project_evaluation');

create type public.team_member_role as enum (
  'design',
  'qa',
  'product_manager',
  'jr_dev',
  'sr_dev'
);

alter table public.wellbeing_campaigns
add column campaign_type public.wellbeing_campaign_type not null default 'wellbeing';

create table public.wellbeing_project_self_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.wellbeing_submissions (id) on delete cascade,
  project_name text not null,
  overall_satisfaction smallint not null check (overall_satisfaction between 1 and 5),
  key_contributions text not null,
  did_well text not null,
  challenges text not null,
  could_do_better text not null,
  learned text not null,
  additional_comments text
);

create table public.wellbeing_team_member_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wellbeing_submissions (id) on delete cascade,
  evaluator_profile_id uuid not null references public.profiles (id) on delete cascade,
  evaluatee_name text not null,
  role public.team_member_role not null,
  did_well text not null,
  could_do_better text not null,
  communication_rating smallint not null check (communication_rating between 1 and 5),
  collaboration_rating smallint not null check (collaboration_rating between 1 and 5),
  problem_solving_rating smallint not null check (problem_solving_rating between 1 and 5),
  overall_rating smallint not null check (overall_rating between 1 and 5),
  additional_comments text
);

create index wellbeing_team_member_evaluations_submission_idx on public.wellbeing_team_member_evaluations (
  submission_id
);

alter table public.wellbeing_project_self_evaluations enable row level security;
alter table public.wellbeing_team_member_evaluations enable row level security;

create policy wellbeing_project_self_evaluations_select on public.wellbeing_project_self_evaluations for select using (
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

create policy wellbeing_project_self_evaluations_insert on public.wellbeing_project_self_evaluations for insert
with check (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (s.profile_id = auth.uid () or public.is_superadmin ())
  )
);

create policy wellbeing_team_member_evaluations_select on public.wellbeing_team_member_evaluations for select using (
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

create policy wellbeing_team_member_evaluations_insert on public.wellbeing_team_member_evaluations for insert
with check (
  exists (
    select 1 from public.wellbeing_submissions s
    where s.id = submission_id
      and (s.profile_id = auth.uid () or public.is_superadmin ())
  )
);
