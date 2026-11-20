import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadVideo } from '../src/lib/clips/resumable.ts';

test('an interrupted upload resumes at the confirmed offset and keeps the original video ID', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'clip-upload-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'clip.mp4');
  await writeFile(path, 'abcdefgh');
  const uri = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test';
  const metadata = { title: 'Test clip', description: 'Source credit', visibility: 'private' };
  let session = null,
    initiations = 0,
    received = 0,
    completed = false;
  const network = async (url, options) => {
    if (options.method === 'POST') {
      initiations++;
      assert.equal(JSON.parse(options.body).status.privacyStatus, 'private');
      return new Response(null, { headers: { Location: uri } });
    }
    assert.equal(url, uri);
    if (completed) return Response.json({ id: 'ABCD1234567' });
    const range = options.headers['Content-Range'];
    if (range === 'bytes */8')
      return new Response(null, { status: 308, headers: received ? { Range: 'bytes=0-3' } : {} });
    if (!received) {
      assert.equal(range, 'bytes 0-7/8');
      received = 4;
      throw Error('Connection interrupted');
    }
    assert.equal(range, 'bytes 4-7/8');
    assert.equal(Buffer.from(options.body).toString(), 'efgh');
    completed = true;
    throw Error('Final acknowledgement lost');
  };
  const attempt = () =>
    uploadVideo(
      path,
      'token',
      metadata,
      session,
      async (u) => {
        session = u;
      },
      network,
    );
  await assert.rejects(attempt, /interrupted/);
  await assert.rejects(attempt, /acknowledgement/);
  assert.equal(await attempt(), 'ABCD1234567');
  assert.equal(initiations, 1);
});

test('an expired session is reported without starting another upload', async () => {
  const uri = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=expired';
  await assert.rejects(
    uploadVideo(
      new URL(import.meta.url),
      'token',
      { title: 'x', description: '', visibility: 'private' },
      uri,
      async () => assert.fail(),
      async (url, opts) => {
        assert.equal(url, uri);
        assert.equal(opts.method, 'PUT');
        return new Response(null, { status: 410 });
      },
    ),
    /410/,
  );
});
