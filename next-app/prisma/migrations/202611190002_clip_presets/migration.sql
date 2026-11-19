CREATE TABLE IF NOT EXISTS clip_preset (
  name text PRIMARY KEY,
  layout jsonb NOT NULL,
  style jsonb NOT NULL
);
