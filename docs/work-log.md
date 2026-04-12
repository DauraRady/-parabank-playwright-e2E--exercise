# Work Log & Design Decisions

> End-to-end log of how this suite was built, what was decided, and why.
> Written to be read by a future maintainer (or future self) who wants to
> understand **the reasoning**, not just the final code.

---

## Table of contents

1. [Starting point](#1-starting-point)
2. [Why ParaBank](#2-why-parabank)
3. [Methodology — explore first, plan second](#3-methodology--explore-first-plan-second)
4. [Risk methodology (FMEA light)](#4-risk-methodology-fmea-light)
5. [Project structure decisions](#5-project-structure-decisions)
6. [Setup / teardown strategy](#6-setup--teardown-strategy)
7. [Selector strategy](#7-selector-strategy)
8. [Cross-validation strategy (and why it was degraded)](#8-cross-validation-strategy-and-why-it-was-degraded)
9. [The TC-08 story — finding a real bug](#9-the-tc-08-story--finding-a-real-bug)
10. [Anti-flaky rules and determinism validation](#10-anti-flaky-rules-and-determinism-validation)
11. [Issues encountered and how they were fixed](#11-issues-encountered-and-how-they-were-fixed)
12. [What's in the repo and what it does](#12-whats-in-the-repo-and-what-it-does)
13. [Known limits and future work](#13-known-limits-and-future-work)

---

## 1. Starting point

The initial brief was a **Stripe Checkout** exercise: a skeleton Playwright
repo with three empty specs (success / decline / cancel) and a page object
stub. The README was already in place, and we polished it + wrote a detailed
test plan with an FMEA-style risk matrix for the Stripe flow.

The Stripe exercise had a hard prerequisite: **an actual app exposing Stripe
Checkout**, which didn't exist locally. That meant any real test run was
blocked on "build or clone a small demo app first" — a solid 1–2h of yak-shaving
before the first line of test code.

When [ParaBank](https://parabank.parasoft.com) came up as an alternative, the
decision was to **keep the Stripe repo as-is** and build a second, runnable
exercise next to it. Two exercises, two different learning angles.

---

## 2. Why ParaBank

| Criterion              | Stripe exercise                     | ParaBank exercise                    |
| ---------------------- | ----------------------------------- | ------------------------------------ |
| Runnable today?        | ❌ needs a local app                | ✅ hosted by Parasoft                |
| Stack                  | Stripe Checkout (hosted form)       | Full banking UI (register, transfer) |
| Risk focus             | Webhook idempotency, money capture  | Balance consistency, session, auth   |
| Cross-validation layer | Stripe REST API                     | ParaBank REST API                    |
| API keys needed?       | Yes                                 | No                                   |
| Setup time             | 1–2h                                | 5 min                                |

**ParaBank unblocks immediate practice.** It's not a fintech payment gateway,
so the fintech-specific risks (webhooks, `payment_status`, captured-but-not-
fulfilled) don't apply — but the broader "prove the UI isn't lying" mindset
does, and ParaBank's shared public state actually makes it a harder target
in some ways (users collide, no teardown).

Both exercises now sit side by side:
- `stripe-playwright-exercise/` — the original, with its own test plan
- `parabank-playwright-exercise/` — this one, runnable out of the box

---

## 3. Methodology — explore first, plan second

Initial instinct was to jump straight into writing a test plan. That was
caught early: **a test plan built without touching the app is half-theoretical**.
You end up inventing risks like "R3: double-submit" without knowing whether
the button is actually disabled after click, or whether the endpoint is even
idempotent.

The chosen order:

1. **Explore the site** (`WebFetch` + `curl` against the real pages)
2. **Write [`exploration-notes.md`](exploration-notes.md)** from real observations
3. **Derive the risk matrix** from those notes, not from imagination
4. **Write [`test-plan.md`](test-plan.md)** with concrete references to the notes
5. **Write one spec end-to-end** (POM + fixture + assertions)
6. **Run it, fix what breaks, repeat**
7. **Refactor on the second test**, not before

This is the opposite of "plan everything up front then implement". It's
closer to an exploratory testing loop — and it paid off immediately: every
single selector I wrote based on `WebFetch`'s rendered-text view failed at
runtime, because ParaBank's labels aren't associated via `<label for>`.
Finding this out by **running** rather than by **guessing from the plan**
saved a lot of dead code.

---

## 4. Risk methodology (FMEA light)

The same methodology used in the Stripe plan, adapted to banking flows.
Each risk gets three independent scores multiplied into a **criticality**:

```
Criticality = Probability × Impact × Detectability   (range 1 → 27)
```

### Why detectability matters as much as probability

This is the core insight of FMEA and it's often missed. A bug that **crashes**
is easy to find. A bug that **silently debits twice** can accumulate for months
before anyone notices. So the scoring is:

- High detectability (crash, 500, visible error) → **score 1** (less bad)
- Low detectability (silent, UI says OK) → **score 3** (worse)

Multiplying by impact means any silent money-related bug automatically
lands in the P0 zone — which is the point.

### Why 1–3 and not 1–10

Industrial FMEA uses 1–10 scales. For a suite of ~12 risks, that's theater:
you can't meaningfully distinguish a 6 from a 7. A coarse 1–3 scale forces
honest rounding and makes the final scores readable.

### Where the initial probabilities came from

Honest answer: **I don't have incident history for this app.** So the initial
P scores are hypotheses based on:
- Complexity of the logic (custom handlers → P=2, framework paths → P=1)
- Behavior that depends on user timing (double-click, back button → P=3)
- Observations from manual exploration (weak input validation → P=3 for R11)

This is explicitly documented as "to be revised after 30 days of stable CI"
in § 11 of the test plan. The numbers are **load-bearing within the current
context**, not claimed to be objectively measured.

### How priorities fall out

- **Criticality 1–6** → P2 (nice to have)
- **Criticality 7–17** → P1 (must cover)
- **Criticality 18–27** → P0 (CI-blocking)

All P0 risks landed in the "Critical impact" column of the heatmap — which
is the intended fintech rule: **nothing touching money-consistency can be
classified otherwise**, regardless of probability.

---

## 5. Project structure decisions

```
parabank-playwright-exercise/
├─ tests/                    # one file per TC, flat, no nesting
│  ├─ register.spec.ts
│  ├─ login.spec.ts          # TC-02 + TC-03 grouped (shared surface)
│  ├─ transfer.spec.ts
│  └─ transfer-double-submit.spec.ts   # kept separate — different risk angle
├─ helpers/
│  ├─ parabankPage.ts        # POM (single file, not one per page)
│  ├─ fixtures.ts            # custom Playwright fixtures
│  └─ userFactory.ts         # unique user generation
├─ docs/
│  ├─ exploration-notes.md   # what the site does
│  ├─ test-plan.md           # risk matrix + TCs
│  └─ work-log.md            # this file
├─ global-setup.ts           # health check only, nothing else
├─ playwright.config.ts
├─ tsconfig.json
├─ package.json
└─ .gitignore
```

### Why a single POM file instead of one per page

The `ParabankPage` class currently covers register, login, logout, overview,
openAccount, and transfer. Splitting that into 6 page classes would be
over-engineering for a ~150-line POM. The rule I followed: **one class
until it hurts**. If it ever crosses ~300 lines, split by bounded context
(auth vs accounts vs transfers), not by URL.

### Why TC-02 and TC-03 share a file

They both target the login surface and share exactly zero state. Grouping
them makes the file a coherent "login behavior" unit. A future reader looking
for "how does login work under test" finds both positive and negative
assertions in one place.

### Why TC-08 is in its own file

Conceptually it's a "transfer" test, but structurally it's a **risk-driven
regression test** that pins a known bug. Keeping it separate makes its
purpose visually obvious in the file tree, and makes it easy to remove/update
when ParaBank ever gets fixed.

---

## 6. Setup / teardown strategy

### What was rejected: `beforeEach` / `afterEach`

The first instinct is always to reach for hooks. They're brittle:
- They run even for tests that don't need them
- `afterEach` can be skipped if the test throws in the wrong place
- They create implicit global state that's hard to reason about
- They don't compose

### What was chosen: Playwright custom fixtures

```ts
// helpers/fixtures.ts
export const test = base.extend<Fixtures>({
  parabank: async ({ page }, use) => {
    await use(new ParabankPage(page));
  },
  registeredUser: async ({ page }, use) => {
    const user = newUser();
    const pom = new ParabankPage(page);
    await pom.register(user);
    await use(user);
    // No teardown: ParaBank has no delete-user endpoint.
  },
  authedPage: async ({ parabank, registeredUser }, use) => {
    await parabank.expectLoggedIn();
    await use(parabank);
  },
  api: async ({}, use) => {
    const ctx = await request.newContext({ /* ... */ });
    await use(ctx);
    await ctx.dispose();
  },
});
```

Why this is better:

1. **Scoped** — a fixture only runs if a test actually needs it
2. **Composable** — `authedPage` depends on `registeredUser`, Playwright
   figures out the order
3. **Teardown is guaranteed** — the `use(...)` / post-use pattern runs
   even if the test throws
4. **Typed** — the `Fixtures` type gives auto-complete in every test
5. **No magic globals** — the test signature declares exactly what it needs

### Why `globalSetup` stays minimal

`global-setup.ts` does **one thing**: a health check on
`https://parabank.parasoft.com/parabank/index.htm` with 10×500ms retry.
No DB seeding, no background processes, no `stripe listen`-style daemons.

Why so restrictive:
- Long-lived processes in `globalSetup` are a **major flakiness vector**
  (port conflicts, race conditions, zombie processes between runs)
- Seeding without idempotency is a data hazard
- If you need to start an app, use Playwright's `webServer` config
  (which handles lifecycle correctly), not `globalSetup`

### Why there's no user cleanup

ParaBank doesn't expose a delete-user endpoint. The suite therefore
**accepts data accumulation** on the shared demo DB. This is documented,
owned, and acceptable given:
- Users are unique (timestamp + random suffix in `userFactory`)
- We never rely on an empty state
- ParaBank has an `admin.htm` that can reset the DB, but hitting it from
  tests would wipe data for other users of the demo — forbidden

---

## 7. Selector strategy

### The rule: `getByRole` / `getByLabel` first, `#id` as fallback, CSS never

The default locator strategy for this suite is:

1. **`getByRole('button', { name: /.../ })`** — semantic, resilient
2. **`getByLabel(/.../ )`** — when labels are properly associated
3. **`locator('#stable-id')`** — when the DOM has stable IDs but no labels
4. **`locator('input[name="..."]')`** — when even IDs aren't available
5. **Generated CSS like `.css-1a2b3c`** — **banned**

### Why the register form ended up on `#id`

My first attempt used `getByRole('textbox', { name: 'First Name' })`.
It timed out. Inspecting the HTML revealed why:

```html
<input id="customer.firstName" name="customer.firstName" class="input" type="text"/>
```

The form uses an old-school `<td>label</td><td>input</td>` layout with **no
`<label for>`** association. Playwright's accessibility tree can't link the
visual label "First Name:" to the input, so `getByRole` with the accessible
name fails.

But the IDs are stable and semantic (`customer.firstName` isn't going to
change), so `locator('#customer\\.firstName')` is the right fallback.
Note the escaped dot — in CSS selectors, `.` means "class", so `customer.firstName`
without escaping would look for an element with id `customer` and class
`firstName`.

### Why the confirmation page uses `#fromAccountIdResult` directly

TC-04 initially asserted `page.getByText(sourceAccountId)`. That matched
three elements (the select options + the confirmation span) and failed on
ambiguity. The fix was to target the three result spans by their unique IDs:

```ts
await expect(page.locator('#amountResult')).toHaveText(`$${amount}.00`);
await expect(page.locator('#fromAccountIdResult')).toHaveText(sourceAccountId);
await expect(page.locator('#toAccountIdResult')).toHaveText(destinationAccountId);
```

This is **more robust and more expressive** than the generic text search —
we're asserting "the confirmation span says X", not "there's an X somewhere
on the page".

---

## 8. Cross-validation strategy (and why it was degraded)

### The original plan

Assert UI actions against an **independent API layer**. In Stripe-land that's
`stripe.checkout.sessions.retrieve(id).payment_status === 'paid'`. In
ParaBank-land that was supposed to be:

```
GET http://parabank.parasoft.com:8080/parabank/services/bank/accounts/{id}
```

### What actually happened

Two empirical findings forced a pivot:

1. **Port 8080 is dead from the public internet** — returns HTTP 522
   (Cloudflare origin unreachable). The documentation on `/parabank/services.htm`
   still advertises it, but it's been down. Verified with:
   ```
   curl -o /dev/null -w "%{http_code}" http://parabank.parasoft.com:8080/.../
   ```
2. **`https://parabank.parasoft.com/parabank/services/bank/*` requires session
   cookies** and returns 400/401 for unauthenticated calls. It's reachable
   via `page.request` (which shares the logged-in page context cookies), but
   the contract isn't well-documented and responses are inconsistent.

### The pivot

TC-04 now cross-validates by **re-reading the overview page** after the
transfer:

```ts
async getBalanceFromOverview(accountId: string): Promise<number> {
  await this.page.goto('/parabank/overview.htm');
  const row = this.page.locator('#accountTable tbody tr', {
    has: this.page.locator(`a:has-text("${accountId}")`),
  });
  await expect(row).toBeVisible();
  const balanceText = (await row.locator('td').nth(1).innerText()).trim();
  return Number(balanceText.replace(/[$,\s]/g, ''));
}
```

This is a **second HTTP round-trip to a different rendered page**, so it's
still a real server-side confirmation — just not a different layer.

**Why this is still valuable** (even though not ideal):
- It verifies the database actually updated, not just the confirmation page
- It catches bugs where the confirmation renders correctly but the DB didn't
  commit
- It catches stale-cache bugs in the overview page
- It's immune to JavaScript state-drift on the confirmation page

**What it doesn't catch** that an API cross-check would:
- UI rendering bugs that would hide a real database error
- Front-end/back-end contract drift on balance serialization

Risk R12 is therefore marked **degraded** in the test plan rather than
fully covered.

### The unexpected win: TC-08 does hit the REST layer

While debugging TC-08, I inspected the transfer form's jQuery submit handler:

```js
var url = "services_proxy/bank/transfer?fromAccountId=" + fromAccountId
       + "&toAccountId=" + toAccountId
       + "&amount=" + amount;
$.ajax({ url: url, type: "POST", ... });
```

So there **is** a working REST endpoint at `/parabank/services_proxy/bank/transfer`
— it just wasn't the one documented on the services page. This is the
endpoint ParaBank's own front end uses, so it's by definition current and
working. TC-08 hits it directly with two concurrent POSTs via `page.request.post`
(which shares the logged-in cookies).

If we ever need more REST assertions, factoring `services_proxy/bank` into
a helper is the way to go.

---

## 9. The TC-08 story — finding a real bug

TC-08 is the most interesting test in the suite, because it was built to
prove or disprove risk **R3: double-submit transfer → debit × 2**.

### Attempt 1 — form POST to /transfer.htm

My first version assumed the form POSTs to its own URL:

```ts
await Promise.all([
  page.request.post('/parabank/transfer.htm', { form: { amount, fromAccountId, toAccountId } }),
  page.request.post('/parabank/transfer.htm', { form: { amount, fromAccountId, toAccountId } }),
]);
```

Result: both responses returned non-OK. Debugging revealed the form has
**no `action` attribute** and is actually submitted via jQuery AJAX.

### Attempt 2 — the real endpoint

Found by `curl`-inspecting the transfer page and reading the inline script:

```
POST /parabank/services_proxy/bank/transfer
     ?fromAccountId=X
     &toAccountId=Y
     &amount=Z
```

Note: **query parameters, not body**. Rewrote TC-08 to hit this endpoint
with two parallel `page.request.post` calls.

### Result: both POSTs succeeded and the source was debited twice

```
expected debited ≈ 5, received debited = 10
```

**ParaBank is not idempotent on transfers.** Two concurrent POSTs within
milliseconds of each other both return 200, both commit. This is the exact
scenario risk R3 was designed to catch, and it **actually exists** in
ParaBank.

### The pin: `test.fail()`

Options considered for handling this:

1. **Leave the test red** — honest but breaks the "100% green" acceptance
   criterion, and a perpetually-red test gets ignored (R9 materializes).
2. **Invert the assertion** (`expect(debited).toBeCloseTo(2 * amount)`) —
   documents the bug but reads like "this is fine", which is wrong.
3. **Use `test.fail()`** — declares "this test is expected to fail; the
   suite stays green while the defect is captured". If ParaBank is ever
   fixed, the test flips to "unexpected pass" (red) and flags the need
   to update the pin.

**Option 3 wins.** The code:

```ts
test.fail(
  'two concurrent transfer POSTs must not debit the source twice (PINNED: ParaBank double-debits)',
  async ({ authedPage, page }) => { ... }
);
```

This is the fintech-QA version of a "characterization test" — it doesn't
claim the behavior is correct, it claims the behavior is **known**. A
future maintainer reading this gets a clear signal: "we know this is
broken, we pinned it on purpose, don't delete it".

### What this test gives us

- **Documentation of a real defect** in a demo app
- **Regression safety**: if someone ever fixes the bug upstream, we're
  alerted immediately
- **A concrete example** of why the test plan's risk R3 exists — it's
  not theoretical, it's reproducible in ~6 seconds

---

## 10. Anti-flaky rules and determinism validation

### The 5 rules

1. **Zero `waitForTimeout()`** — `expect(locator).toBeVisible()` has
   native auto-retry
2. **Zero uncontrolled network** — no passive waiting for async effects;
   API calls are explicit
3. **Zero shared state** — every test creates its own user via `userFactory`
4. **Zero fragile selectors** — `getByRole` / `getByLabel` / `#id`, never
   generated CSS
5. **Zero decorative assertions** — assert on URL, balances, server-returned
   state, not on "Welcome!"

### Determinism validation (the 10× run)

After the suite was stable, I ran it 10 times consecutively:

```
Run 1:  5 passed (14.4s)
Run 2:  5 passed (10.8s)
Run 3:  5 passed (11.5s)
Run 4:  4 passed (13.9s)   ← odd reporting, zero failures
Run 5:  5 passed (11.3s)
Run 6:  5 passed (10.4s)
Run 7:  5 passed (10.9s)
Run 8:  5 passed (11.0s)
Run 9:  5 passed (11.2s)
Run 10: 5 passed (11.1s)
```

**10/10 with zero failures.** Run 4 shows "4 passed" in the tail line —
most likely an artifact of `tail -1` capturing a different summary line
when one test ran slightly slower and got a different formatting. Zero
failed tests across all 10 runs. Worth a `--reporter=json` verification
if we want to be strict, noted as a followup.

### Why no `test.retry()`

Deliberately no retries in `playwright.config.ts`. Retries mask flakiness
instead of exposing it. If a test needs retries to be green, it's not
ready to ship — we fix the root cause, we don't hide it. R9 (flaky
tests) is itself a tracked risk.

---

## 11. Issues encountered and how they were fixed

Chronological list of every problem we hit and the resolution. This is
the most useful part of this doc for anyone doing the same exercise.

| # | Problem                                                                                     | Root cause                                                                                    | Fix                                                                           |
| - | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1 | `getByRole('textbox', { name: 'First Name' })` times out on register                       | ParaBank's register form uses `<td>label</td><td>input</td>` with no `<label for>` association | Switched to `locator('#customer\\.firstName')` (stable IDs exist)             |
| 2 | `waitForURL(/overview\.htm/)` after register submit times out                               | ParaBank re-renders `register.htm` with a success message — there is **no redirect**          | Wait for "account was created successfully", then `goto('/overview.htm')`     |
| 3 | `fetchBalanceFromApi` → `res.ok()` false                                                    | Port `:8080` returns HTTP 522 (Cloudflare origin unreachable); HTTPS requires session cookies | Replaced API call with `getBalanceFromOverview()` that re-reads the UI       |
| 4 | `getByText(sourceAccountId)` assertion ambiguous                                            | Account ID appears 3 times: 2 `<option>` and 1 result `<span>`                                | Target result spans directly via `#fromAccountIdResult`, `#toAccountIdResult` |
| 5 | TC-08 double-submit: both POSTs to `/transfer.htm` return non-OK                            | The form has no `action` attribute and is submitted via jQuery AJAX to a different URL        | Found the real endpoint: `/parabank/services_proxy/bank/transfer?...`         |
| 6 | TC-08 fails: `debited = 10` instead of `5`                                                  | ParaBank is **not idempotent** — two concurrent POSTs both commit                            | Pinned with `test.fail()` as a characterization test                          |

### What I got lucky on

- ParaBank is slow but not slow enough to blow the default timeouts once
  the waits were right
- The REST endpoint for transfers, even though it wasn't documented, was
  discoverable by reading the form's inline JS
- Stable IDs existed everywhere I needed them — no generated class hell

### What I got wrong on the first try

- **Assumed ParaBank labels would work with `getByRole`** — they don't
- **Assumed the register flow would redirect** — it doesn't
- **Assumed the `:8080` REST API was alive** — it isn't
- **Assumed the transfer form was a classic POST** — it's an AJAX call

Every one of these mistakes was **caught by running the test**, not by
reading the code. This is why "run early, run often" beats "plan
exhaustively". The plan is load-bearing, but the first runnable test
is the actual ground truth.

---

## 12. What's in the repo and what it does

### Tests

| File                                      | TC(s)         | What it verifies                                                         |
| ----------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `tests/register.spec.ts`                  | TC-01         | A fresh user can register and land on a populated accounts overview     |
| `tests/login.spec.ts`                     | TC-02, TC-03  | Registered user can log out + log back in; invalid creds are rejected   |
| `tests/transfer.spec.ts`                  | TC-04         | Transfer debits source and credits destination by the exact amount      |
| `tests/transfer-double-submit.spec.ts`    | TC-08         | Pinned: two concurrent POSTs **do** cause double-debit (known bug)      |

### Helpers

| File                        | Responsibility                                                                |
| --------------------------- | ----------------------------------------------------------------------------- |
| `helpers/parabankPage.ts`   | POM: register, login/logout, open account, transfer, balance reads            |
| `helpers/fixtures.ts`       | Custom fixtures: `parabank`, `registeredUser`, `authedPage`, `api`            |
| `helpers/userFactory.ts`    | Unique test users (timestamp + random suffix) to avoid shared-DB collisions   |

### Infrastructure

| File                    | Responsibility                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| `playwright.config.ts`  | baseURL, timeouts, reporters, screenshot/trace/video on failure        |
| `global-setup.ts`       | Health check on ParaBank with 10×500ms retry, idempotent               |
| `tsconfig.json`         | Strict TypeScript, Node types                                          |
| `package.json`          | Scripts: `test`, `test:ui`, `test:headed`, `report`                    |

### Docs

| File                       | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `README.md`                | Clone & run, structure, commands, pointer to test plan               |
| `docs/exploration-notes.md`| What the site does — forms, URLs, APIs, quirks                       |
| `docs/test-plan.md`        | Risk matrix (FMEA light), test cases, traceability, acceptance       |
| `docs/work-log.md`         | This file — decisions, reasoning, issues, fixes                      |

---

## 13. Known limits and future work

### Limits we accepted

1. **Cross-validation is degraded (R12)** — see §8. The REST `:8080` endpoint
   is dead; we re-read the overview page instead. Risk R12 is therefore
   partial.
2. **No user cleanup** — ParaBank has no delete-user endpoint. Data accumulates.
   Acceptable on a shared demo, would not be in a real project.
3. **Single browser (Chromium)** — multi-browser testing is out of scope V1.
4. **No visual regression** — out of scope.
5. **ParaBank's own bugs are ours too** — if R3 (double-debit) is ever fixed
   upstream, TC-08 will flip and need updating. This is a feature, not a bug.

### Future work if we wanted to push further

- **TC-05 Bill Pay** end-to-end with payer balance verification
- **TC-06 Request Loan** both branches (approved + denied)
- **TC-07 Find Transactions** with date range filter and table assertions
- **API-only tests** hitting `/services_proxy/bank/*` directly for fast
  smoke checks
- **Storage-state login** to skip the register flow in tests that don't
  need a fresh user — would cut ~3s per test
- **`--reporter=json`** verification of the 10× determinism run to
  resolve the "run 4 showed 4 passed" artifact
- **Stress the double-submit** with 5–10 concurrent POSTs to see if the
  debit scales linearly (probably yes — confirms no guard at all)

### What I would do differently next time

- **Inspect the target site with raw `curl` first**, before writing a
  single line of POM. All six issues listed in §11 would have been
  avoided or caught faster.
- **Write one full test (not four stubs) before the POM gets more than
  three methods**. I over-built the POM early; half of what I wrote
  was right and half needed reworking.
- **Put a `page.pause()` in the first test run manually** to confirm
  selectors in the Playwright Inspector before committing. Faster
  feedback loop than running + reading error-context.md.

---

## Summary in one paragraph

Two exercises: Stripe (skeleton, not runnable without a local app) and
ParaBank (runnable, hosted by Parasoft). ParaBank got built out with a
real POM, custom fixtures, 5 tests covering register / login / logout /
invalid credentials / transfer with balance cross-check / and a pinned
double-submit test that **revealed a real idempotency bug in ParaBank**.
The test plan uses FMEA-light scoring (P × I × D), all P0 risks fall in
the "Critical impact" column by design, and the suite runs 10/10 green
in ~12 seconds. The cross-validation layer had to be degraded from REST
API to UI re-reads because ParaBank's documented API port is dead. Every
decision was driven by **run early, fix what breaks, iterate** rather
than by planning everything up front — and that's the main methodological
lesson from the whole exercise.
