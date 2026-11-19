export async function register() {
  // The BullMQ worker is initialized by queue.ts and uses the Redis service.
  console.log('[Queue] Next.js server booted with Redis-backed BullMQ queue.');
}
