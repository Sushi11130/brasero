create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  chat_blocked boolean not null default false,
  flame_streak integer not null default 0,
  last_message_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  is_general boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.messages
add column if not exists room_id uuid;

alter table public.messages
drop constraint if exists messages_room_id_fkey;

alter table public.messages
add constraint messages_room_id_fkey
foreign key (room_id) references public.rooms(id) on delete cascade;

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '😂', '❤️', '🔥', '👀')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create unique index if not exists rooms_single_general
on public.rooms ((is_general))
where is_general = true;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  original_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 160),
  options jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  option_text text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_not_blocked()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and chat_blocked = false
  );
$$;

create or replace function public.can_access_room(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms
    where id = target_room_id
      and is_general = true
  )
  or exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  )
  or public.is_admin();
$$;

create or replace function public.create_private_room(room_name text, member_ids uuid[])
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  created_room public.rooms;
  member_id uuid;
begin
  if not public.is_not_blocked() then
    raise exception 'Chat bloque';
  end if;

  insert into public.rooms (name, is_general, created_by)
  values (left(trim(room_name), 60), false, auth.uid())
  returning * into created_room;

  insert into public.room_members (room_id, user_id)
  values (created_room.id, auth.uid())
  on conflict do nothing;

  foreach member_id in array member_ids loop
    insert into public.room_members (room_id, user_id)
    values (created_room.id, member_id)
    on conflict do nothing;
  end loop;

  return created_room;
end;
$$;

create or replace function public.touch_flame()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  today date := current_date;
begin
  select * into profile
  from public.profiles
  where id = auth.uid();

  if profile.id is null then
    raise exception 'Profil introuvable';
  end if;

  if profile.last_message_on = today then
    return profile;
  end if;

  update public.profiles
  set
    flame_streak = case
      when last_message_on = today - 1 then flame_streak + 1
      else 1
    end,
    last_message_on = today
  where id = auth.uid()
  returning * into profile;

  return profile;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.files enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "messages_select_authenticated" on public.messages;
create policy "messages_select_authenticated"
on public.messages for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists "messages_insert_unblocked" on public.messages;
create policy "messages_insert_unblocked"
on public.messages for insert
to authenticated
with check (author_id = auth.uid() and public.is_not_blocked() and public.can_access_room(room_id));

drop policy if exists "rooms_select_accessible" on public.rooms;
create policy "rooms_select_accessible"
on public.rooms for select
to authenticated
using (is_general or public.can_access_room(id));

drop policy if exists "rooms_insert_unblocked" on public.rooms;
create policy "rooms_insert_unblocked"
on public.rooms for insert
to authenticated
with check (created_by = auth.uid() and public.is_not_blocked());

drop policy if exists "room_members_select_accessible" on public.room_members;
create policy "room_members_select_accessible"
on public.room_members for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists "room_members_insert_creator_or_admin" on public.room_members;
create policy "room_members_insert_creator_or_admin"
on public.room_members for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1 from public.rooms
    where rooms.id = room_id
      and rooms.created_by = auth.uid()
  )
);

drop policy if exists "message_reactions_select_accessible" on public.message_reactions;
create policy "message_reactions_select_accessible"
on public.message_reactions for select
to authenticated
using (
  exists (
    select 1
    from public.messages
    where messages.id = message_id
      and public.can_access_room(messages.room_id)
  )
);

drop policy if exists "message_reactions_insert_self" on public.message_reactions;
create policy "message_reactions_insert_self"
on public.message_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages
    where messages.id = message_id
      and public.can_access_room(messages.room_id)
  )
);

drop policy if exists "message_reactions_delete_self" on public.message_reactions;
create policy "message_reactions_delete_self"
on public.message_reactions for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "files_select_authenticated" on public.files;
create policy "files_select_authenticated"
on public.files for select
to authenticated
using (true);

drop policy if exists "files_insert_unblocked" on public.files;
create policy "files_insert_unblocked"
on public.files for insert
to authenticated
with check (owner_id = auth.uid() and public.is_not_blocked());

drop policy if exists "polls_select_authenticated" on public.polls;
create policy "polls_select_authenticated"
on public.polls for select
to authenticated
using (true);

drop policy if exists "polls_insert_authenticated" on public.polls;
create policy "polls_insert_authenticated"
on public.polls for insert
to authenticated
with check (creator_id = auth.uid());

drop policy if exists "poll_votes_select_authenticated" on public.poll_votes;
create policy "poll_votes_select_authenticated"
on public.poll_votes for select
to authenticated
using (true);

drop policy if exists "poll_votes_upsert_self" on public.poll_votes;
create policy "poll_votes_upsert_self"
on public.poll_votes for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "poll_votes_update_self" on public.poll_votes;
create policy "poll_votes_update_self"
on public.poll_votes for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

insert into public.rooms (name, is_general)
values ('General', true)
on conflict do nothing;

update public.messages
set room_id = (select id from public.rooms where is_general = true order by created_at limit 1)
where room_id is null;

drop policy if exists "storage_files_select_authenticated" on storage.objects;
create policy "storage_files_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'files');

drop policy if exists "storage_files_insert_own_folder" on storage.objects;
create policy "storage_files_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'files'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.is_not_blocked()
);

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.room_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.files;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;
