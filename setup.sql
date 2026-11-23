-- =====================================================================
--  Work Desk: collaboration database setup for Supabase
--  How to use: Supabase dashboard → SQL Editor → New query →
--  paste this whole file → Run. It is safe to run more than once.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

-- Display name + color for each person (shown on avatars, comments, chat)
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default 'Writer' check (char_length(name) between 1 and 60),
  color      text not null default '#c13fb0',
  updated_at timestamptz not null default now()
);

-- One row per shared book. "meta" holds author, notebook, map, timeline.
create table if not exists public.books (
  id          uuid primary key,
  owner       uuid not null default auth.uid() references public.profiles on delete cascade,
  title       text not null default 'Untitled Novel',
  meta        jsonb not null default '{}'::jsonb,
  cover       text not null default '',
  cover_thumb text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- Who can open a book, and what they may do
create table if not exists public.book_members (
  book_id   uuid not null references public.books on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade,
  role      text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table if not exists public.chapters (
  id         text primary key,
  book_id    uuid not null references public.books on delete cascade,
  pos        double precision not null default 0,
  title      text not null default '',
  synopsis   text not null default '',
  status     text not null default 'draft',
  stickies   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists chapters_book_idx on public.chapters (book_id);

-- Every paragraph is its own row, so two people can write in different
-- paragraphs of the same chapter at the same time.
create table if not exists public.blocks (
  id         text primary key,
  chapter_id text not null references public.chapters on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  pos        double precision not null,
  html       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists blocks_book_idx on public.blocks (book_id);

create table if not exists public.comments (
  id          text primary key,
  book_id     uuid not null references public.books on delete cascade,
  chapter_id  text not null references public.chapters on delete cascade,
  block_id    text not null,
  kind        text not null default 'comment' check (kind in ('comment', 'note')),
  body        text not null check (char_length(body) between 1 and 5000),
  resolved    boolean not null default false,
  author      uuid default auth.uid(),
  author_name text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists comments_book_idx on public.comments (book_id);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  book_id    uuid not null references public.books on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  name       text not null default '',
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_book_idx on public.messages (book_id, created_at);

create table if not exists public.invites (
  code       text primary key default encode(gen_random_bytes(9), 'hex'),
  book_id    uuid not null references public.books on delete cascade,
  role       text not null check (role in ('editor', 'commenter', 'viewer')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Helper functions -----------------------------------------

create or replace function public.book_role(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.book_members where book_id = b and user_id = auth.uid()
$$;

create or replace function public.can_read(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.book_role(b) is not null
$$;

create or replace function public.can_edit(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.book_role(b) in ('owner', 'editor'), false)
$$;

create or replace function public.can_comment(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.book_role(b) in ('owner', 'editor', 'commenter'), false)
$$;

-- The creator of a book automatically becomes its owner
create or replace function public.add_book_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.book_members (book_id, user_id, role) values (new.id, new.owner, 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists books_add_owner on public.books;
create trigger books_add_owner after insert on public.books
  for each row execute function public.add_book_owner();

-- Stamp who changed what and when
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books for each row execute function public.touch_row();
drop trigger if exists chapters_touch on public.chapters;
create trigger chapters_touch before insert or update on public.chapters for each row execute function public.touch_row();
drop trigger if exists blocks_touch on public.blocks;
create trigger blocks_touch before insert or update on public.blocks for each row execute function public.touch_row();

-- Join a book with an invite code
create or replace function public.join_book(invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into inv from public.invites where code = invite_code;
  if not found then raise exception 'That invite code is not valid (it may have been deleted)'; end if;
  insert into public.book_members (book_id, user_id, role)
  values (inv.book_id, auth.uid(), inv.role)
  on conflict (book_id, user_id) do nothing;
  return inv.book_id;
end $$;
revoke all on function public.join_book(text) from public;
grant execute on function public.join_book(text) to authenticated;

-- ---------- Row level security (who may read / write what) -----------

alter table public.profiles     enable row level security;
alter table public.books        enable row level security;
alter table public.book_members enable row level security;
alter table public.chapters     enable row level security;
alter table public.blocks       enable row level security;
alter table public.comments     enable row level security;
alter table public.messages     enable row level security;
alter table public.invites      enable row level security;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "books read"   on public.books;
drop policy if exists "books insert" on public.books;
drop policy if exists "books update" on public.books;
drop policy if exists "books delete" on public.books;
create policy "books read"   on public.books for select to authenticated using (owner = auth.uid() or public.can_read(id));
create policy "books insert" on public.books for insert to authenticated with check (owner = auth.uid());
create policy "books update" on public.books for update to authenticated using (public.can_edit(id));
create policy "books delete" on public.books for delete to authenticated using (public.book_role(id) = 'owner');

drop policy if exists "members read"   on public.book_members;
drop policy if exists "members update" on public.book_members;
drop policy if exists "members delete" on public.book_members;
create policy "members read"   on public.book_members for select to authenticated using (public.can_read(book_id));
create policy "members update" on public.book_members for update to authenticated
  using (public.book_role(book_id) = 'owner' and role <> 'owner')
  with check (role in ('editor', 'commenter', 'viewer'));
create policy "members delete" on public.book_members for delete to authenticated
  using (role <> 'owner' and (public.book_role(book_id) = 'owner' or user_id = auth.uid()));

drop policy if exists "chapters read"  on public.chapters;
drop policy if exists "chapters write" on public.chapters;
create policy "chapters read"  on public.chapters for select to authenticated using (public.can_read(book_id));
create policy "chapters write" on public.chapters for all to authenticated
  using (public.can_edit(book_id)) with check (public.can_edit(book_id));

drop policy if exists "blocks read"  on public.blocks;
drop policy if exists "blocks write" on public.blocks;
create policy "blocks read"  on public.blocks for select to authenticated using (public.can_read(book_id));
create policy "blocks write" on public.blocks for all to authenticated
  using (public.can_edit(book_id)) with check (public.can_edit(book_id));

drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments update" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read"   on public.comments for select to authenticated using (public.can_read(book_id));
create policy "comments insert" on public.comments for insert to authenticated
  with check (public.can_comment(book_id) and author = auth.uid());
create policy "comments update" on public.comments for update to authenticated
  using (public.can_comment(book_id)) with check (public.can_comment(book_id));
create policy "comments delete" on public.comments for delete to authenticated
  using (author = auth.uid() or public.can_edit(book_id));

drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
drop policy if exists "messages delete" on public.messages;
create policy "messages read"   on public.messages for select to authenticated using (public.can_read(book_id));
create policy "messages insert" on public.messages for insert to authenticated
  with check (public.can_read(book_id) and user_id = auth.uid());
create policy "messages delete" on public.messages for delete to authenticated using (user_id = auth.uid());

drop policy if exists "invites owner" on public.invites;
create policy "invites owner" on public.invites for all to authenticated
  using (public.book_role(book_id) = 'owner') with check (public.book_role(book_id) = 'owner');

-- ---------- Live updates (Realtime) ----------------------------------

do $$
declare t text;
begin
  foreach t in array array['books', 'book_members', 'chapters', 'blocks', 'comments', 'messages'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Done! Go back to Work Desk → Share → paste your Project URL and anon key.
