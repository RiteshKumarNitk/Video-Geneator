import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { getStoragePath } from '../storage';

export async function serveVideo(req: Request, relative: string, download?: string) {
  const filename = getStoragePath(relative);
  const size = (await stat(filename)).size;
  const range = req.headers.get('range');
  const mime: Record<string, string> = {
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
  };
  const headers = new Headers({
    'Content-Type': mime[path.extname(relative).toLowerCase()] || 'video/mp4',
    'Cache-Control': 'private,no-store',
    Vary: 'Cookie',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': download ? 'attachment; filename="' + download + '.mp4"' : 'inline',
    'X-Content-Type-Options': 'nosniff',
  });
  let start = 0,
    end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  }
  headers.set('Content-Length', String(end - start + 1));
  const body =
    req.method === 'HEAD'
      ? null
      : (Readable.toWeb(createReadStream(filename, { start, end })) as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}

export async function exportProgress(id: string, status: string) {
  if (status === 'completed') return 100;
  if (status === 'processing') {
    try {
      return Number(await readFile(getStoragePath('processed/clips/' + id + '.progress'), 'utf8'));
    } catch {
      /* The encoder has not emitted its first timestamp yet. */
    }
  }
  return 0;
}
