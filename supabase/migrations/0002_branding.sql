-- Team branding (logo + colors), shared by every member of the team.
-- Run this in the Supabase SQL Editor after 0001_init.sql.
alter table public.teams add column if not exists branding jsonb not null default '{}'::jsonb;

create or replace function public.set_team_branding(team uuid, b jsonb)
returns public.teams language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_team_member(team) then raise exception 'not a member of this team'; end if;
  if length(b::text) > 300000 then raise exception 'branding too large'; end if;
  if coalesce(b->>'accent', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid accent color'; end if;
  if b->>'appearance' not in ('system', 'light', 'dark') then raise exception 'invalid appearance'; end if;
  if b->>'logo' is not null and b->>'logo' !~ '^data:image/(png|webp|jpeg);base64,' then raise exception 'invalid logo'; end if;
  update public.teams
     set branding = jsonb_build_object('accent', b->>'accent', 'appearance', b->>'appearance', 'logo', b->'logo')
   where id = team
   returning * into t;
  return t;
end $$;

revoke all on function public.set_team_branding(uuid, jsonb) from public, anon;
grant execute on function public.set_team_branding(uuid, jsonb) to authenticated;

-- Let other phones pick up branding changes live.
alter publication supabase_realtime add table public.teams;
