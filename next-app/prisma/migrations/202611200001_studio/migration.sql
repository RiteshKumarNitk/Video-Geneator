create table if not exists clip_channel (
  owner text primary key references "user"(id) on delete cascade,
  channel_id text, channel_name text, credential text,
  automatic boolean not null default false, visibility text not null default 'private',
  spacing integer not null default 0, next_slot timestamptz,
  seconds integer not null default 35, preset text not null default ''
);
create table if not exists clip_oauth (
  state text primary key, owner text not null references "user"(id) on delete cascade,
  verifier text not null, expires timestamptz not null
);
create table if not exists clip_publication (
  clip uuid primary key references clip(id), export_id uuid not null references clip_export(id),
  owner text not null references clip_channel(owner), channel_id text not null,
  visibility text not null, due timestamptz not null, title text not null, description text not null,
  status text not null default 'queued', uri text, video text, error text, tries integer not null default 0,
  retry_at timestamptz not null default now()
);
alter table clip_export add column if not exists quality jsonb;
alter table clip add column if not exists reason text not null default '';
alter table clip add column if not exists batch uuid;
alter table clip add column if not exists skipped boolean not null default false;
alter table clip add column if not exists description text not null default '';
alter table clip_source add column if not exists motion jsonb;
alter table clip add column if not exists auto_render boolean not null default false;
alter table clip_channel add column if not exists render_batches boolean not null default false;
alter table clip_channel add column if not exists tone text not null default 'quote';
alter table clip_channel add column if not exists credit boolean not null default true;
create table if not exists clip_batch_request (
  id uuid primary key, source uuid not null unique references clip_source(id), error text
);
