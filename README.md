# ParaBank Playwright Exercise

End-to-end test suite targeting **[ParaBank](https://parabank.parasoft.com)** — Parasoft's public banking demo, used as a realistic playground for Playwright practice.

Unlike the [Stripe exercise](../stripe-playwright-exercise/README.md), no local app is required: ParaBank is hosted by Parasoft, so you can run the suite immediately after `npm install`.

---

## Table of contents

- [What this exercise covers](#what-this-exercise-covers)
- [Stack](#stack)
- [Clone & run](#clone--run)
- [Available commands](#available-commands)
- [Project structure](#project-structure)
- [Test plan & exploration](#test-plan--exploration)
- [Scenarios implemented](#scenarios-implemented)
- [Determinism rules](#determinism-rules)
- [Known constraints of ParaBank](#known-constraints-of-parabank)
- [Next steps](#next-steps)

---

## What this exercise covers

ParaBank exposes a full banking UI: register, login, open account, transfer funds, bill pay, request loan, find transactions. It also ships a **REST API** (`/parabank/services/bank/*`) that we use for **cross-validation** — assert the UI *and* the backend state, not just one or the other.

The exercise focuses on:

- Register → Login → Transfer end-to-end
- Multi-step flows with session state
- Cross-validation UI ↔ REST API (the "fintech mindset" part)
- Deterministic tests against a **shared public environment** (no test pollution)

---

## Stack

| Component    | Tech                | Version |
| ------------ | ------------------- | ------- |
| Test runner  | `@playwright/test`  | ^1.54   |
| Language     | TypeScript          | ^5.9    |
| Runtime      | Node.js             | 20+     |
| SUT          | ParaBank (hosted)   | N/A     |

No local app, no API keys, no `.env`.

---

## Clone & run

```bash
git clone <repo-url> parabank-playwright-exercise
cd parabank-playwright-exercise
npm install
npx playwright install
npm test
```

---

## Available commands

```bash
npm test                  # headless run
npm run test:ui           # interactive UI mode
npm run test:headed       # visible browser
npm run report            # open the latest HTML report
```

Run a single file or match a title:

```bash
npx playwright test tests/register.spec.ts
npx playwright test -g "transfer funds"
```

---

## Project structure

```text
parabank-playwright-exercise/
├─ tests/
│  ├─ register.spec.ts       # register + auto-login
│  ├─ login.spec.ts          # login / logout / invalid credentials
│  └─ transfer.spec.ts       # open account + transfer funds
├─ helpers/
│  ├─ parabankPage.ts        # Page Object Model
│  ├─ fixtures.ts            # custom Playwright fixtures
│  └─ userFactory.ts         # generates unique test users
├─ docs/
│  ├─ exploration-notes.md   # manual exploration log (site map, fields, risks)
│  └─ test-plan.md           # FMEA risk matrix + test cases
├─ playwright.config.ts
├─ package.json
└─ .gitignore
```

---

## Test plan & exploration

- [`docs/exploration-notes.md`](docs/exploration-notes.md) — what the site actually does: URLs, forms, APIs, quirks observed during manual exploration.
- [`docs/test-plan.md`](docs/test-plan.md) — FMEA-light risk matrix (Probability × Impact × Detectability), test cases, traceability, anti-flaky strategy.
- [`docs/patterns.md`](docs/patterns.md) — catalog of the Playwright / deterministic patterns used in the suite, with "where and why".
- [`docs/work-log.md`](docs/work-log.md) — decision log: what was built, what was decided, and every issue encountered with its fix.

Read both before writing new tests — they explain **why** each scenario matters and **how** to keep the suite deterministic on a shared public environment.

---

## Scenarios implemented

| ID    | Title                          | Priority | File                        | Status |
| ----- | ------------------------------ | -------- | --------------------------- | ------ |
| TC-01 | Register + auto-login          | P0       | `tests/register.spec.ts`    | ✅     |
| TC-02 | Login happy path + logout      | P0       | `tests/login.spec.ts`       | ✅     |
| TC-03 | Login with invalid credentials | P1       | `tests/login.spec.ts`       | ✅     |
| TC-04 | Transfer funds between accounts| P0       | `tests/transfer.spec.ts`    | ✅     |
| TC-08 | Double-submit transfer (pinned)| P0       | `tests/transfer-double-submit.spec.ts` | ⚠️ pinned bug |
| TC-09 | Full banking journey           | P1       | `tests/journey.spec.ts`     | ✅     |
| TC-05 | Bill Pay end-to-end            | P1       | —                           | 🎯 V2  |
| TC-06 | Request Loan                   | P1       | —                           | 🎯 V2  |
| TC-07 | Find Transactions by date      | P2       | —                           | 🎯 V2  |

See the full list and justifications in [`docs/test-plan.md`](docs/test-plan.md).

---

## Determinism rules

Five non-negotiable rules, the same as the Stripe exercise:

1. **Zero `waitForTimeout()`** — use `expect(locator).toBeVisible()` with auto-retry
2. **Zero uncontrolled network** — no passive waiting for async effects
3. **Zero shared state between tests** — every test creates its own user via `userFactory`
4. **Zero fragile selectors** — `getByRole` / `getByLabel` only, no generated CSS classes
5. **Zero decorative assertions** — assert on URL, API responses, and balances, not on "Welcome!"

Merge threshold: **10/10 on 10 consecutive CI runs**. No `test.retry()` to mask flakiness.

---

## Known constraints of ParaBank

ParaBank is a **shared public environment**, so tests have to behave accordingly:

- **Users can collide** → `userFactory` appends a timestamp + random suffix to every username
- **Data is not reset** between runs → tests never rely on an empty state
- **The site can go down** → `globalSetup` does a health check with retry before the suite runs
- **The REST API is on a different port** (`:8080`) and may be slow → used only for cross-validation, not as the main path
- **No teardown of created users** — ParaBank doesn't expose a delete-user endpoint; we accept the data accumulation

---

## Next steps

Once V1 is green and stable:

- Add TC-05 (Bill Pay) and TC-06 (Request Loan)
- Add API-only tests hitting `/parabank/services/bank/*` directly (pre-seed accounts via API, assert via UI)
- Add TC-07 with date-range filtering and table assertions
- Investigate double-submit on Transfer (risk R3 in the test plan)
