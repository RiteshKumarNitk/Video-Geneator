import postgres from 'postgres';
export const sql = postgres(process.env.DATABASE_URL || 'postgres://chroma:chroma@localhost:5432/chroma', {
  max: 5,
});
export const uuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
export class InputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function failure(e: unknown) {
  if (!(e instanceof InputError)) console.error('[Clips]', e);
  return Response.json(
    { error: e instanceof InputError ? e.message : 'Clips request failed. Check the service logs.' },
    { status: e instanceof InputError ? e.status : 500 },
  );
}
