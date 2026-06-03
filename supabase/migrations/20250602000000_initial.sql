-- Flywheel Discord PoC schema

create type public.user_role as enum ('superadmin', 'member');
create type public.conversation_source as enum ('web', 'discord');
create type public.message_role as enum ('user', 'assistant');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  instructions text not null default '',
  context text not null default '',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  organization_id uuid references public.organizations (id) on delete set null,
  discord_user_id text unique,
  discord_username text,
  created_at timestamptz not null default now()
);

create table public.discord_guild_links (
  guild_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  default_assistant_id uuid not null references public.assistants (id) on delete restrict,
  linked_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  source public.conversation_source not null default 'web',
  cursor_agent_id text,
  discord_thread_key text,
  updated_at timestamptz not null default now()
);

create unique index conversations_discord_thread_unique on public.conversations (
  profile_id,
  assistant_id,
  discord_thread_key
) where discord_thread_key is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_discord_user_id_idx on public.profiles (discord_user_id);
create index assistants_organization_id_idx on public.assistants (organization_id);
create index conversations_profile_id_idx on public.conversations (profile_id);
create index messages_conversation_id_idx on public.messages (conversation_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, new.raw_user_meta_data ->> 'email', ''),
    'member'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

-- Helpers for RLS
create or replace function public.current_profile_role ()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid ();
$$;

create or replace function public.current_organization_id ()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid ();
$$;

create or replace function public.is_superadmin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'superadmin' from public.profiles where id = auth.uid ()),
    false
  );
$$;

alter table public.organizations enable row level security;
alter table public.assistants enable row level security;
alter table public.profiles enable row level security;
alter table public.discord_guild_links enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- organizations
create policy organizations_select on public.organizations for select using (
  public.is_superadmin ()
  or id = public.current_organization_id ()
);

create policy organizations_insert on public.organizations for insert
with check (public.is_superadmin ());

create policy organizations_update on public.organizations for update
using (public.is_superadmin ());

create policy organizations_delete on public.organizations for delete
using (public.is_superadmin ());

-- assistants
create policy assistants_select on public.assistants for select using (
  public.is_superadmin ()
  or organization_id = public.current_organization_id ()
);

create policy assistants_insert on public.assistants for insert
with check (public.is_superadmin ());

create policy assistants_update on public.assistants for update
using (public.is_superadmin ());

create policy assistants_delete on public.assistants for delete
using (public.is_superadmin ());

-- profiles
create policy profiles_select on public.profiles for select using (
  public.is_superadmin ()
  or id = auth.uid ()
  or organization_id = public.current_organization_id ()
);

create policy profiles_update_self on public.profiles for update using (
  id = auth.uid ()
) with check (id = auth.uid ());

create policy profiles_update_admin on public.profiles for update using (
  public.is_superadmin ()
);

-- discord_guild_links
create policy guild_links_select on public.discord_guild_links for select using (
  public.is_superadmin ()
  or organization_id = public.current_organization_id ()
);

create policy guild_links_admin on public.discord_guild_links for all using (
  public.is_superadmin ()
) with check (public.is_superadmin ());

-- conversations
create policy conversations_select on public.conversations for select using (
  public.is_superadmin () or profile_id = auth.uid ()
);

create policy conversations_insert on public.conversations for insert
with check (profile_id = auth.uid () or public.is_superadmin ());

create policy conversations_update on public.conversations for update using (
  profile_id = auth.uid () or public.is_superadmin ()
);

-- messages
create policy messages_select on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.profile_id = auth.uid () or public.is_superadmin ())
  )
);

create policy messages_insert on public.messages for insert
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.profile_id = auth.uid () or public.is_superadmin ())
  )
);
