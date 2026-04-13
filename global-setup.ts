import { request } from '@playwright/test';

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
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  await ctx.dispose();
  throw new Error('ParaBank health check failed after 10 attempts — aborting suite.');
}
