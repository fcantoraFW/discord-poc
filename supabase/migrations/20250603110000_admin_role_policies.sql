-- Step 2/2: policies and helpers (run after 20250603100000_admin_role.sql is committed).

drop index if exists public.conversations_discord_thread_unique;

create unique index if not exists conversations_discord_thread_per_profile on public.conversations (
  profile_id,
  discord_thread_key
) where discord_thread_key is not null;

create or replace function public.is_org_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin'::public.user_role from public.profiles where id = auth.uid ()),
    false
  );
$$;

create or replace function public.can_manage_organization (target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin ()
    or (
      public.is_org_admin ()
      and public.current_organization_id () = target_org
    );
$$;

-- assistants: org admin can CRUD in their org
drop policy if exists assistants_insert on public.assistants;
create policy assistants_insert on public.assistants for insert
with check (public.can_manage_organization (organization_id));

drop policy if exists assistants_update on public.assistants;
create policy assistants_update on public.assistants for update
using (public.can_manage_organization (organization_id));

drop policy if exists assistants_delete on public.assistants;
create policy assistants_delete on public.assistants for delete
using (public.can_manage_organization (organization_id));

-- profiles: org admin can read org members; only superadmin changes roles
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
using (public.is_superadmin ());

drop policy if exists profiles_update_org_admin on public.profiles;
create policy profiles_update_org_admin on public.profiles for update
using (
  public.is_org_admin ()
  and organization_id = public.current_organization_id ()
  and role = 'member'::public.user_role
) with check (
  organization_id is null
  and role = 'member'::public.user_role
);

-- discord guild links: org admin for their org
drop policy if exists guild_links_admin on public.discord_guild_links;
drop policy if exists guild_links_select on public.discord_guild_links;
create policy guild_links_select on public.discord_guild_links for select using (
  public.is_superadmin ()
  or organization_id = public.current_organization_id ()
);

drop policy if exists guild_links_insert on public.discord_guild_links;
create policy guild_links_insert on public.discord_guild_links for insert
with check (public.can_manage_organization (organization_id));

drop policy if exists guild_links_update on public.discord_guild_links;
create policy guild_links_update on public.discord_guild_links for update
using (public.can_manage_organization (organization_id));

drop policy if exists guild_links_delete on public.discord_guild_links;
create policy guild_links_delete on public.discord_guild_links for delete
using (public.can_manage_organization (organization_id));
