import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { randomBytes, createHmac } from 'node:crypto';
import path from 'node:path';
import { headers } from 'next/headers';
import { sql, InputError } from './clips/db';
import { getJob, type Job } from './jobsStore';

async function initialize() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://chroma:chroma@localhost:5432/chroma',
    max: 4,
  });
  try {
    const secret = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(56310272)`;
      await tx.file(path.join(process.cwd(), 'prisma/migrations/202611190003_private_clips/migration.sql'));
      await tx`insert into workspace_secret values ('sessions',${randomBytes(48).toString('hex')}) on conflict do nothing`;
      const [row] = await tx`select value from workspace_secret where purpose='sessions'`;
      return row.value as string;
    });
    const origin = process.env.BETTER_AUTH_URL;
    const auth = betterAuth({
      database: pool,
      secret: process.env.BETTER_AUTH_SECRET || secret,
      baseURL: origin || {
        allowedHosts: ['localhost', '127.0.0.1', 'localhost:*', '127.0.0.1:*'],
        protocol: 'http',
        fallback: 'http://localhost',
      },
      advanced: { useSecureCookies: origin?.startsWith('https://') ?? false },
      emailAndPassword: { enabled: true },
      appName: 'ChromaAI',
    });
    return { auth, secret };
  } catch (e) {
    await pool.end();
    throw e;
  }
}
const runtime = globalThis as typeof globalThis & { chromaAuth?: ReturnType<typeof initialize> };
export function workspaceAuth() {
  return (runtime.chromaAuth ??= initialize().catch((e) => {
    runtime.chromaAuth = undefined;
    throw e;
  }));
}
export async function session() {
  const requestHeaders = await headers();
  return (await workspaceAuth()).auth.api.getSession({ headers: requestHeaders });
}
export async function owner() {
  const user = (await session())?.user;
  if (!user) throw new InputError('Sign in to open Clips.', 401);
  return user.id;
}
export function mayReadJob(job: Job, user?: string) {
  return job.owner ? job.owner === user : !job.originalVideo && job.type !== 'CLIP_ANALYSIS';
}
export async function visibleJob(id: string) {
  const job = await getJob(id);
  return job && mayReadJob(job, (await session())?.user.id) ? job : null;
}
export async function callbackToken(id: string) {
  return createHmac('sha256', (await workspaceAuth()).secret)
    .update('media-callback:' + id)
    .digest('hex');
}
