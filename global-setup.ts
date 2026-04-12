import { request } from '@playwright/test';

/**
 * Health check on the public ParaBank instance with a small retry loop.
 * Kept minimal and idempotent — no background processes, no seeding.
 */
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: 'https://parabank.parasoft.com' });
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await ctx.get('/parabank/index.htm', { timeout: 5_000 });
      if (res.ok()) {
        await ctx.dispose();
        return;
      }
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await ctx.dispose();
  throw new Error('ParaBank health check failed after 10 attempts — aborting suite.');
}
