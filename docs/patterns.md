# Deterministic Patterns Used in This Suite

> A catalog of the Playwright / testing patterns this suite demonstrates,
> why each one matters for determinism, and **exactly where** it lives in
> the code. Use this as a cheat-sheet when copying patterns into other
> projects.

---

## Table of contents

1. [Custom fixtures (implicit try/finally)](#1-custom-fixtures-implicit-tryfinally)
2. [Auto-retrying assertions](#2-auto-retrying-assertions)
3. [`expect.poll` for eventual consistency](#3-expectpoll-for-eventual-consistency)
4. [`Promise.all` — right use, wrong use](#4-promiseall--right-use-wrong-use)
5. [`test.step` for readable multi-phase tests](#5-teststep-for-readable-multi-phase-tests)
6. [`test.fail` as a characterization pin](#6-testfail-as-a-characterization-pin)
7. [Health check retry in `globalSetup`](#7-health-check-retry-in-globalsetup)
8. [Unique test data factory](#8-unique-test-data-factory)
9. [Robust selectors hierarchy](#9-robust-selectors-hierarchy)
10. [What's deliberately NOT used](#10-whats-deliberately-not-used)

---

## 1. Custom fixtures (implicit try/finally)

**What**: Playwright's `test.extend` to define reusable setup/teardown
units that run only for tests that request them.

**Where**: [`helpers/fixtures.ts`](../helpers/fixtures.ts)

```ts
export const test = base.extend<Fixtures>({
  registeredUser: async ({ page }, use) => {
    const user = newUser();
    const pom = new ParabankPage(page);
    await pom.register(user);
    await use(user);
    // anything here runs as teardown — guaranteed even if the test throws
  },
  authedPage: async ({ parabank, registeredUser }, use) => {
    await parabank.expectLoggedIn();
    await use(parabank);
  },
});
```

**Why deterministic**: the code around `use(...)` is the exact shape of
`try { ... } finally { ... }` — Playwright guarantees the post-`use` block
runs on both success and failure paths. No `afterEach` to forget, no
hook ordering to debug.

**When to use over `beforeEach`**:
- Always, for anything non-trivial
- Especially for setup that only some tests need (fixture dependencies
  make this declarative, hooks make it global)

---

## 2. Auto-retrying assertions

**What**: `expect(locator).toBeVisible()` (and friends) automatically
retry until the condition is met or the timeout expires.

**Where**: everywhere — e.g. [`helpers/parabankPage.ts`](../helpers/parabankPage.ts):

```ts
await expect(
  this.page.getByText(/your account was created successfully/i),
).toBeVisible();
```

**Why deterministic**: no `waitForTimeout`, no manual retry loops. The
default timeout is `expect.timeout` from the config (10s here). Every
assertion is a **wait on the expected state**, not a race with the DOM.

**Common mistake** — bypassing the retry:
```ts
// ❌ Takes a snapshot of textContent once, no retry
const text = await page.locator('h1').textContent();
expect(text).toBe('Welcome');

// ✅ Retries until the text matches or times out
await expect(page.locator('h1')).toHaveText('Welcome');
```

---

## 3. `expect.poll` for eventual consistency

**What**: `expect.poll(fn, opts).toBeGreaterThan(0)` re-runs `fn` until
the predicate holds, with configurable backoff.

**Where**: [`tests/journey.spec.ts`](../tests/journey.spec.ts) — step
"Poll the transactions REST endpoint until the transfer appears":

```ts
await expect
  .poll(
    async () => {
      const res = await page.request.get(url);
      if (!res.ok()) return 0;
      const txs = (await res.json()) as Array<{ amount: number }>;
      return txs.filter((t) => Number(t.amount) === amount).length;
    },
    {
      timeout: 10_000,
      intervals: [250, 500, 1000],  // backoff: 250ms → 500ms → 1000ms
      message: `Expected a debit of $${amount} to appear`,
    },
  )
  .toBeGreaterThan(0);
```

**Why deterministic**: this is the canonical pattern for testing **async
pipelines** — webhooks arriving, background jobs completing, caches
invalidating. Instead of "sleep 3 seconds then assert" (flaky), you
re-check cheaply until the state is what you expect.

**Why we call it on the REST endpoint, not the UI page**:
- The activity page loads transactions via jQuery AJAX in `document.ready`
- Polling the page means re-navigating and re-triggering the AJAX each
  iteration — slow and fragile
- Polling the endpoint directly is what the UI itself does — same source
  of truth, no rendering layer in the way

**When to use**:
- Waiting for a webhook-driven state change
- Waiting for a cache to refresh
- Waiting for an async job to complete
- Anything where "it will eventually be true" is the semantics

**When NOT to use**:
- Synchronous state → use `expect(locator).toHaveX()` (auto-retry is enough)
- Polling against UI elements when an API equivalent exists → prefer API

---

## 4. `Promise.all` — right use, wrong use

### ✅ Right use — genuinely concurrent server requests

**Where**: [`tests/transfer-double-submit.spec.ts`](../tests/transfer-double-submit.spec.ts)

```ts
const [res1, res2] = await Promise.all([
  page.request.post(url),
  page.request.post(url),
]);
```

**Why it works**: two independent HTTP requests hitting the server in
parallel. This is exactly what `Promise.all` is for — and it's the only
way to faithfully simulate a double-click race on the backend.

### ❌ Wrong use — two `page.goto` on the same page

Caught during TC-09 development:
```ts
// ❌ The second navigation aborts the first → net::ERR_ABORTED
const [a, b] = await Promise.all([
  pom.getBalanceFromOverview(id1),
  pom.getBalanceFromOverview(id2),
]);
```

**Why it fails**: both calls do `page.goto('/overview')` on the same
`Page` object. Playwright can't satisfy two concurrent navigations — one
aborts.

**The fix**: read both values from a single visit. See
`getAllBalancesFromOverview` in [`helpers/parabankPage.ts`](../helpers/parabankPage.ts):

```ts
async getAllBalancesFromOverview(): Promise<Map<string, number>> {
  await this.page.goto('/parabank/overview.htm');
  // ... iterate rows, build Map
}
```

**Rule of thumb**: `Promise.all` is for **independent** operations. Two
UI reads that share a `Page` are not independent.

---

## 5. `test.step` for readable multi-phase tests

**What**: wrap logical phases of a long test so they show up as
collapsible sections in the Playwright HTML report.

**Where**: [`tests/journey.spec.ts`](../tests/journey.spec.ts)

```ts
await test.step('Register a fresh user and land on the overview', async () => {
  await parabank.register(user);
  await parabank.expectLoggedIn();
  // ...
});

await test.step('Open a second checking account', async () => { ... });
await test.step('Snapshot both balances in a single overview read', ...);
await test.step(`Transfer $${amount} between the two accounts`, async () => { ... });
await test.step('Verify both balances updated by exactly the amount', ...);
await test.step('Poll the transactions REST endpoint ...', async () => { ... });
```

**Why it matters**:
- The HTML report shows each step with its own duration
- When a test fails, you instantly see **which step** failed, not just
  which line
- Steps with clear imperative names double as in-code documentation
- Zero runtime cost — `test.step` is pure bookkeeping

**When to use**:
- Long end-to-end journeys (TC-09 here)
- Any test with > 3 logical phases
- Tests where a future reader will ask "what's this block doing?"

---

## 6. `test.fail` as a characterization pin

**What**: mark a test as **expected to fail**. If it fails (as expected),
it's counted as passed. If it unexpectedly passes, the run goes red.

**Where**: [`tests/transfer-double-submit.spec.ts`](../tests/transfer-double-submit.spec.ts)

```ts
test.fail(
  'two concurrent transfer POSTs must not debit the source twice (PINNED: ParaBank double-debits)',
  async ({ authedPage, page }) => {
    // ... two concurrent POSTs, assert on no-double-debit
    expect(debited).toBeCloseTo(amount, 2);
  },
);
```

**Why this pattern matters**: we found a real idempotency bug in
ParaBank — two concurrent POSTs both succeed, both debit. Three options
were considered:

1. Leave the test red → violates "100% green" acceptance, gets ignored
2. Invert the assertion → reads like "this is fine", wrong signal
3. Use `test.fail` → **declares** "this is a known defect, pinned"

Option 3 is the **characterization test** pattern from legacy code books:
the test doesn't claim the behavior is correct, it claims it is **known
and stable**. If ParaBank ever fixes the bug, the test flips to
"unexpected pass" and we're alerted.

**When to use**:
- A real bug you can't fix upstream (third-party, legacy, demo site)
- A known-broken behavior you want to regression-test
- A spec that describes future behavior, marked `test.fail` until the
  implementation catches up

**Never use for**:
- Flaky tests (use `test.fixme` or fix the root cause)
- Tests you don't understand

---

## 7. Health check retry in `globalSetup`

**What**: verify the SUT is reachable before running **any** test, with
a small retry loop to absorb cold-start latency.

**Where**: [`global-setup.ts`](../global-setup.ts)

```ts
for (let attempt = 1; attempt <= 10; attempt++) {
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
throw new Error('ParaBank health check failed after 10 attempts');
```

**Why this is the *only* thing in globalSetup**:
- Long-lived processes (like `stripe listen`) are a flakiness hotbed
- Non-idempotent seeding corrupts shared state
- If you need to start an app, use `webServer` in the config, not
  globalSetup — Playwright handles the lifecycle for you

**Why retry**:
- A cold public site may take 2–3s to respond on the first request
- A single check is a race condition with CDN warm-up, container boot, etc.
- 10 × 500ms = 5s budget, zero impact if the site is already warm

---

## 8. Unique test data factory

**What**: a factory that generates a fresh identity per call so parallel
test runs never collide on shared state.

**Where**: [`helpers/userFactory.ts`](../helpers/userFactory.ts)

```ts
export function newUser(): NewUser {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  return {
    firstName: 'Test',
    lastName: `User${suffix.slice(-6)}`,
    username: `pw_${suffix}`,
    // ...
  };
}
```

**Why this pattern matters on a shared environment**:
- ParaBank's DB is public — usernames collide across users
- Parallel Playwright workers could collide even in a solo run
- Using `Date.now()` alone isn't enough (multiple calls within the same
  millisecond) → add random suffix

**When to use**:
- Any shared environment (demo sites, shared staging, CI clusters)
- Parallel test execution (`fullyParallel: true` in the config)
- Tests that create any persistent identity

---

## 9. Robust selectors hierarchy

**What**: a strict order of preference for locating elements, from most
resilient to least.

**The order**:
1. `getByRole('button', { name: /.../ })` — semantic, accessibility-aware
2. `getByLabel(/.../ )` — when labels are properly associated
3. `locator('#stable-id')` — stable id, no semantic info
4. `locator('input[name="..."]')` — form fields without id
5. **Banned**: `locator('.css-1a2b3c')`, `locator('div > div > span:nth-child(3)')`

**Where ParaBank forced us down to level 3**:
[`helpers/parabankPage.ts`](../helpers/parabankPage.ts) — the register
form. The visual labels aren't wired up via `<label for>`, so `getByRole`
can't link them. The IDs are stable and semantic (`customer.firstName`),
so that's the right fallback:

```ts
await this.page.locator('#customer\\.firstName').fill(user.firstName);
```

Note the escaped `.` — CSS treats `.` as "class", so it needs backslash.

**Why the order matters**:
- Higher levels survive refactors and redesigns
- Lower levels are more precise but brittle
- **Never** skip to a lower level without trying the higher ones first

---

## 10. What's deliberately NOT used

Some patterns are conspicuously absent. Each one was considered and
ruled out — here's the reasoning so the gaps aren't mysterious.

| Pattern                   | Why not (here)                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| `test.retry()`            | Masks flakiness instead of exposing it. A test needing retries isn't shippable |
| `beforeEach`/`afterEach`  | Fixtures are strictly better — scoped, typed, composable, teardown-safe        |
| `page.waitForTimeout()`   | Never. Ever. Auto-retry via `expect(...)` covers every legitimate case         |
| `storageState` reuse      | Would skip register → saves ~3s per test, but breaks TC-04/09 fresh-state assumption. Deferred |
| API-first user creation   | ParaBank's register endpoint is undocumented — risky on a shared demo          |
| Multi-browser testing     | Out of V1 scope — ParaBank is the system, not the browser runtime              |
| Visual regression         | Out of scope — ParaBank's HTML is too dated to make visual diffs meaningful    |
| `request.newContext` per test with base auth | ParaBank uses session cookies from UI login — cleaner via `page.request` which shares context state |

---

## Summary: how to copy a pattern

Each section above tells you:
- **What** the pattern is
- **Where** in this repo to see it in action
- **Why** it makes tests more deterministic
- **When** to use (and when not to)

If you're porting a pattern to another project: read the "where" section,
copy the snippet, then read "why" to make sure the justification still
holds in your context. A pattern used without understanding is worse
than no pattern at all.
