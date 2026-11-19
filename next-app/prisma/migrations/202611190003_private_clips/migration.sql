-- Better Auth PostgreSQL schema. Existing installations may already have these tables.
CREATE TABLE IF NOT EXISTS "user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL, image text,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "session" (
 id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL,
 "ipAddress" text, "userAgent" text,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
CREATE TABLE IF NOT EXISTS account (
 id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "accountId" text NOT NULL, "providerId" text NOT NULL,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
 scope text, password text,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON account("userId");
CREATE TABLE IF NOT EXISTS verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

ALTER TABLE clip_source ADD COLUMN IF NOT EXISTS owner text REFERENCES "user"(id);
DROP INDEX IF EXISTS clip_source_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS clip_source_owner_url ON clip_source(owner,url);
CREATE INDEX IF NOT EXISTS clip_source_owner ON clip_source(owner);
CREATE TABLE IF NOT EXISTS clip_user_preset (
 owner text NOT NULL REFERENCES "user"(id), name text NOT NULL, layout jsonb NOT NULL, style jsonb NOT NULL,
 PRIMARY KEY(owner,name)
);
CREATE TABLE IF NOT EXISTS workspace_secret (purpose text PRIMARY KEY, value text NOT NULL);
