import { owner } from '@/lib/auth';
import { callback } from '@/lib/clips/youtube';
import { failure } from '@/lib/clips/db';
export async function GET(req: Request) {
  try {
    await callback(await owner(), new URL(req.url));
    return Response.redirect(new URL('/clips', process.env.BETTER_AUTH_URL), 303);
  } catch (e) {
    return failure(e);
  }
}
