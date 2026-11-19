import { owner } from '@/lib/auth';
import { failure, InputError, sql, uuid } from '@/lib/clips/db';
import { serveVideo } from '@/lib/clips/media';
import { saveUpload } from '@/lib/videoUpload';
import { enqueue } from '@/lib/clips/worker';
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const user = await owner();
    const { id } = await params;
    if (!uuid(id)) throw new InputError('Invalid source.', 404);
    const [source] =
      await sql`select path,cues from clip_source where id=${id} and owner=${user} and status='ready'`;
    if (!source) throw new InputError('Source is unavailable.', 404);
    const cue = new URL(req.url).searchParams.get('cue');
    if (cue !== null) {
      if (!/^\d+$/.test(cue) || !source.cues[Number(cue)]) throw new InputError('Unknown cue.', 404);
      const res = await fetch((process.env.PYTHON_AI_URL || 'http://localhost:8000') + '/clips/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source.cues[Number(cue)].text }),
      });
      if (!res.ok) throw Error('Caption renderer unavailable.');
      return new Response(res.body, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private,no-store' },
      });
    }
    return await serveVideo(req, source.path);
  } catch (e) {
    return failure(e);
  }
}
export const HEAD = GET;

export async function PUT(req: Request, { params }: Context) {
  try {
    const user = await owner();
    const { id } = await params;
    if (!uuid(id)) throw new InputError('Invalid source.', 404);
    const [row] =
      await sql`update clip_source set status='uploading',updated=now() where id=${id} and owner=${user} and status='waiting' and url is null returning filename,attempt`;
    if (!row) throw new InputError('This source is not waiting for a file.', 409);
    try {
      await saveUpload(req, id, row.filename);
      await sql`update clip_source set status='queued' where id=${id} and attempt=${row.attempt}`;
    } catch (e) {
      await sql`update clip_source set status='failed', error='Upload interrupted. Select the file again.' where id=${id} and attempt=${row.attempt}`;
      throw e;
    }
    await enqueue({ kind: 'source', id, attempt: row.attempt });
    return Response.json({ id });
  } catch (e) {
    return failure(e);
  }
}
