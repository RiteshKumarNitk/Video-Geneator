import { workspaceAuth } from '@/lib/auth';
async function handle(req: Request) {
  return (await workspaceAuth()).auth.handler(req);
}
export const GET = handle;
export const POST = handle;
