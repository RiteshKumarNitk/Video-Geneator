import { owner } from '@/lib/auth';
import { validStyle } from '@/lib/clips/model';
import { InputError, failure } from '@/lib/clips/db';

export async function POST(req: Request) {
  try {
    await owner();
    const data = await req.json();
    if (!validStyle(data.style)) throw new InputError('Invalid caption style.');
    const measuring = Array.isArray(data.cues);
    const texts = measuring ? data.cues : [data];
    if (
      texts.length > 64 ||
      texts.some((c: { text?: unknown }) => typeof c?.text !== 'string' || c.text.length > 5000)
    )
      throw new InputError('Invalid caption text.');
    const res = await fetch(
      (process.env.PYTHON_AI_URL || 'http://localhost:8000') +
        '/clips/' +
        (measuring ? 'measure' : 'caption'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: req.signal,
      },
    );
    if (!res.ok) throw Error('Caption service unavailable');
    return new Response(res.body, {
      headers: {
        'Content-Type': measuring ? 'application/json' : 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
