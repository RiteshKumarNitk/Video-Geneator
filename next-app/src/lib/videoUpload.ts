import Busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { getStoragePath } from './storage';

export async function saveUpload(req: Request, id: string, expectedName?: string) {
  if (!req.body) throw Error('Empty upload.');
  const dir = getStoragePath('uploads');
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, id + '.' + randomUUID() + '.part');
  let filename = '';
  const body = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
  try {
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const parser = Busboy({ headers: Object.fromEntries(req.headers), limits: { files: 1 } });
      let written: Promise<void> | undefined;
      let multiple = false;
      parser.on('filesLimit', () => {
        multiple = true;
      });
      parser.on('file', (_, file, info) => {
        filename = info.filename;
        written = pipeline(file, createWriteStream(temp, { flags: 'wx' }));
        written.catch((e) => parser.destroy(e));
      });
      await pipeline(body, parser);
      await written;
      if (multiple || !written) throw Error('Choose one video.');
    } else {
      filename = expectedName || req.headers.get('x-file-name') || 'video.mp4';
      await pipeline(body, createWriteStream(temp, { flags: 'wx' }));
    }
    const ext = path.extname(expectedName || filename).toLowerCase();
    const relative = 'uploads/' + id + (/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '.mp4');
    await rename(temp, getStoragePath(relative));
    return { relative, filename };
  } finally {
    await rm(temp, { force: true });
  }
}
