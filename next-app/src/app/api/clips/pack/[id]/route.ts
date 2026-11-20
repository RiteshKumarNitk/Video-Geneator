import { owner } from '@/lib/auth';
import { sql, InputError, failure, uuid } from '@/lib/clips/db';
import { getStoragePath } from '@/lib/storage';
import { ZipFile } from 'yazl';
import { Readable } from 'node:stream';
import { stat } from 'node:fs/promises';
import type { Cue } from '@/lib/clips/model';
function timestamp(t: number) {
  const ms = Math.round(t * 1000);
  return (
    [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':') +
    ',' +
    String(ms % 1000).padStart(3, '0')
  );
}
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await owner(),
      { id } = await params;
    if (!uuid(id)) throw new InputError('Pack unavailable.', 404);
    const query = new URL(req.url).searchParams;
    const facebook = query.get('platform') === 'facebook';
    const single = facebook && query.get('scope') === 'export';
    const rows = single
      ? await sql`select c.title,c.description,e.id,e.status,e.snapshot,e.quality from clip_export e join clip c on c.id=e.clip join clip_source s on s.id=c.source where e.id=${id} and s.owner=${user}`
      : await sql`select c.title,c.description,e.id,e.status,e.snapshot,e.quality from clip c join clip_source s on s.id=c.source left join lateral(select * from clip_export where clip=c.id order by created desc limit 1)e on true where c.batch=${id} and s.owner=${user} and not c.skipped order by c.created,c.id`;
    if (!rows.length) throw new InputError('Pack unavailable.', 404);
    if (rows.some((r) => r.status !== 'completed'))
      throw new InputError('Export every included draft before downloading the pack.', 409);
    const zip = new ZipFile();
    await Promise.all(rows.map((r) => stat(getStoragePath('processed/clips/' + r.id + '.mp4'))));
    rows.forEach((r, i) => {
      const folder = String(i + 1).padStart(2, '0') + '/';
      zip.addFile(getStoragePath('processed/clips/' + r.id + '.mp4'), folder + 'short.mp4', {
        compress: false,
      });
      if (facebook) {
        const description = (r.description || '').replace(/#Shorts\b/gi, '#Reels').trim();
        const parts = description.startsWith(r.title) ? [description] : [r.title, description];
        zip.addBuffer(Buffer.from(parts.filter(Boolean).join('\n\n') + '\n'), folder + 'facebook-caption.txt');
      } else {
        zip.addBuffer(Buffer.from(r.title + '\n\n' + r.description + '\n'), folder + 'youtube.txt');
      }
      const srt = r.snapshot.cues
        .map(
          (c: Cue, j: number) =>
            j + 1 + '\n' + timestamp(c.start) + ' --> ' + timestamp(c.end) + '\n' + c.text + '\n',
        )
        .join('\n');
      zip.addBuffer(Buffer.from(srt), folder + 'captions.srt');
      if (r.quality)
        zip.addBuffer(Buffer.from(JSON.stringify(r.quality, null, 2)), folder + 'quality.json');
    });
    zip.end();
    return new Response(Readable.toWeb(zip.outputStream as Readable) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="' + (facebook ? 'Facebook-Reels-' : 'Shorts-') + id + '.zip"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
