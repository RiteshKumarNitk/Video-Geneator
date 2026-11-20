import { open } from 'node:fs/promises';

export async function uploadVideo(
  path: string,
  accessToken: string,
  metadata: { title: string; description: string; visibility: string },
  session: string | null,
  saveSession: (uri: string) => Promise<void>,
  request: typeof fetch = fetch,
) {
  const auth = { Authorization: 'Bearer ' + accessToken };
  const file = await open(path);
  try {
    const size = (await file.stat()).size;
    let uri = session;
    if (!uri) {
      const init = await request(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false',
        {
          method: 'POST',
          headers: {
            ...auth,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': String(size),
            'X-Upload-Content-Type': 'video/mp4',
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            snippet: { title: metadata.title, description: metadata.description, categoryId: '20' },
            status: { privacyStatus: metadata.visibility },
          }),
        },
      );
      uri = init.headers.get('location');
      if (!init.ok || !uri || new URL(uri).origin !== 'https://www.googleapis.com')
        throw Error('YouTube upload initialization failed (' + init.status + ').');
      await saveSession(uri);
    }
    async function put(range: string, body?: ArrayBuffer) {
      return request(uri!, {
        method: 'PUT',
        redirect: 'manual',
        headers: { ...auth, 'Content-Type': 'video/mp4', 'Content-Range': range },
        body,
        signal: AbortSignal.timeout(90000),
      });
    }
    let response = await put('bytes */' + size);
    while (response.status === 308) {
      const range = response.headers.get('range');
      const offset = range ? Number(/^bytes=0-(\d+)$/.exec(range)?.[1]) + 1 : 0;
      if (!Number.isSafeInteger(offset) || offset >= size) throw Error('Unexpected YouTube upload offset.');
      const chunk = new ArrayBuffer(Math.min(8 * 1024 * 1024, size - offset));
      const { bytesRead } = await file.read(new Uint8Array(chunk), 0, chunk.byteLength, offset);
      if (bytesRead !== chunk.byteLength) throw Error('Export changed during upload.');
      response = await put('bytes ' + offset + '-' + (offset + bytesRead - 1) + '/' + size, chunk);
      if (response.status === 308 && response.headers.get('range') === range)
        throw Error('Upload interrupted.');
    }
    if (!response.ok)
      throw Error('YouTube upload returned ' + response.status + '. Check YouTube Studio before retrying.');
    const { id } = await response.json();
    if (!/^[\w-]{11}$/.test(id || '')) throw Error('YouTube returned no video ID. Check YouTube Studio.');
    return id as string;
  } finally {
    await file.close();
  }
}
