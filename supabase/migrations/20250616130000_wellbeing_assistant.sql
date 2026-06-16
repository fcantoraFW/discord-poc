-- Per-org HR / wellbeing assistant for survey copy (instructions + context)

alter table public.organizations
add column if not exists wellbeing_assistant_id uuid references public.assistants (id) on delete set null;

create index if not exists organizations_wellbeing_assistant_id_idx on public.organizations (
  wellbeing_assistant_id
);
