CREATE TABLE IF NOT EXISTS clip_source (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  path text NOT NULL UNIQUE,
  url text,
  status text NOT NULL,
  error text,
  metadata jsonb,
  cues jsonb NOT NULL DEFAULT '[]',
  analysis text,
  suggestions jsonb NOT NULL DEFAULT '[]',
  attempt uuid NOT NULL,
  updated timestamptz NOT NULL DEFAULT now(),
  created timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clip_source_url_key ON clip_source(url);
CREATE TABLE IF NOT EXISTS clip (
  id uuid PRIMARY KEY,
  source uuid NOT NULL REFERENCES clip_source(id),
  title text NOT NULL,
  settings jsonb NOT NULL,
  created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clip_source_idx ON clip(source);
CREATE TABLE IF NOT EXISTS clip_export (
  id uuid PRIMARY KEY,
  clip uuid NOT NULL REFERENCES clip(id),
  snapshot jsonb NOT NULL,
  status text NOT NULL,
  error text,
  attempt uuid NOT NULL,
  created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clip_export_idx ON clip_export(clip);
