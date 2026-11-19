import { exportProgress } from '@/lib/clips/media';
import { owner } from '@/lib/auth';
import { sql, uuid, InputError, failure } from '@/lib/clips/db';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await owner(),
      { id } = await params;
    if (!uuid(id)) throw new InputError('Unknown export.', 404);
    const [row] =
      await sql`select e.id,e.clip,e.status,e.error from clip_export e join clip c on c.id=e.clip join clip_source s on s.id=c.source where e.id=${id} and s.owner=${user}`;
    if (!row) throw new InputError('Unknown export.', 404);
    return Response.json(
      { ...row, progress: await exportProgress(id, row.status) },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
