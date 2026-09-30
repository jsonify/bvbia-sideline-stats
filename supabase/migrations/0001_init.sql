-- Sideline Stats schema. Run once in the Supabase SQL editor (or `supabase db push`).

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  join_code text not null unique,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index on public.team_members (user_id);

create table public.games (
  id uuid primary key,                       -- client generated (idempotent upserts)
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent text not null,
  date date not null,
  location text,
  home boolean not null default true,
  periods smallint not null default 2 check (periods in (2, 4)),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.games (team_id);

create table public.stat_events (
  id uuid primary key,                       -- client generated
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, -- denormalised for RLS/realtime filter
  category text not null check (category in ('duel', 'first_contact', 'box_entry')),
  outcome text not null,
  ball_type text check (ball_type in ('through_ball', 'long_ball')),
  period smallint not null default 1,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                    -- soft delete = undo
  keeper_id text,
  check (
    (category = 'duel' and outcome in ('won', 'lost') and ball_type is null) or
    (category = 'first_contact' and outcome in ('clean', 'miss') and ball_type is not null) or
    (category = 'box_entry' and outcome in ('shot', 'no_shot') and ball_type is null)
  )
);
create index on public.stat_events (game_id);
create index on public.stat_events (team_id);

-- Membership helper (security definer avoids RLS recursion on team_members).
create or replace function public.is_team_member(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = tid and user_id = auth.uid());
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.games enable row level security;
alter table public.stat_events enable row level security;

create policy "members read team" on public.teams for select using (public.is_team_member(id));
create policy "members read membership" on public.team_members for select using (public.is_team_member(team_id));

create policy "members read games" on public.games for select using (public.is_team_member(team_id));
create policy "members insert games" on public.games for insert with check (public.is_team_member(team_id));
create policy "members update games" on public.games for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

create policy "members read events" on public.stat_events for select using (public.is_team_member(team_id));
create policy "members insert events" on public.stat_events for insert with check (public.is_team_member(team_id));
create policy "members update events" on public.stat_events for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
-- No hard deletes from clients: undo is a soft delete.

-- RPCs ------------------------------------------------------------------
create or replace function public.create_team(team_name text)
returns public.teams language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  t public.teams;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.teams where join_code = code);
  end loop;
  insert into public.teams (name, join_code, created_by) values (trim(team_name), code, auth.uid()) returning * into t;
  insert into public.team_members (team_id, user_id) values (t.id, auth.uid());
  return t;
end $$;

create or replace function public.join_team(code text)
returns public.teams language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into t from public.teams where join_code = upper(trim(code));
  if not found then raise exception 'team not found'; end if;
  insert into public.team_members (team_id, user_id) values (t.id, auth.uid()) on conflict do nothing;
  return t;
end $$;

revoke all on function public.create_team(text), public.join_team(text) from public, anon;
grant execute on function public.create_team(text), public.join_team(text) to authenticated;

-- Realtime ----------------------------------------------------------------
alter publication supabase_realtime add table public.games, public.stat_events;
