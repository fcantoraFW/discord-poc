-- Prevent authenticated users from escalating role/org via self-update.
-- Service-role and superadmin updates are unaffected (auth.uid() null or is_superadmin).

create or replace function public.lock_profile_privileged_fields_on_self_update ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.id
     and not public.is_superadmin () then
    if new.role is distinct from old.role
       or new.organization_id is distinct from old.organization_id
       or new.email is distinct from old.email then
      raise exception 'Cannot modify protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_profile_privileged_fields_on_self_update on public.profiles;

create trigger lock_profile_privileged_fields_on_self_update
before update on public.profiles
for each row
execute function public.lock_profile_privileged_fields_on_self_update ();
