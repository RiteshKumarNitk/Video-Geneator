import { owner } from '@/lib/auth';
import { sql, InputError, failure, uuid } from '@/lib/clips/db';
import { serveVideo } from '@/lib/clips/media';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await owner();
    const { id } = await params;
    if (!uuid(id)) throw new InputError('Invalid export.', 404);
    const [row] =
      await sql`select e.id from clip_export e join clip c on c.id=e.clip join clip_source s on s.id=c.source where e.id=${id} and s.owner=${user} and e.status='completed'`;
    if (!row) throw new InputError('Export is unavailable.', 404);
    return await serveVideo(
      req,
      'processed/clips/' + id + '.mp4',
      new URL(req.url).searchParams.get('play') === '1' ? undefined : id,
    );
  } catch (e) {
    return failure(e);
  }
}
export const HEAD = GET;
