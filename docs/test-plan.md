# Test Plan — ParaBank E2E

> Test plan for the Playwright suite targeting [ParaBank](https://parabank.parasoft.com).
> Built from observations in [`exploration-notes.md`](exploration-notes.md). Referenced from the [README](../README.md).

---

## Table of contents

1. [Context & objectives](#1-context--objectives)
2. [Scope](#2-scope)
3. [Risk methodology (FMEA light)](#3-risk-methodology-fmea-light)
4. [Risk matrix](#4-risk-matrix)
5. [Probability × Impact heatmap](#5-probability--impact-heatmap)
6. [Test cases](#6-test-cases)
7. [Anti-flaky strategy](#7-anti-flaky-strategy)
8. [Setup / teardown](#8-setup--teardown)
9. [Risk → test traceability](#9-risk--test-traceability)
10. [Acceptance criteria](#10-acceptance-criteria)
11. [Assumptions & limits](#11-assumptions--limits)

---

## 1. Context & objectives

ParaBank is a public banking demo with Register, Login, Open Account, Transfer Funds, Bill Pay, Loan, and Find Transactions. It exposes a UI **and** a REST API on port `:8080`, which lets us cross-validate the two layers.

### Objectives

1. Guarantee the core journey **Register → Login → Transfer** works end-to-end
2. Cross-validate UI actions against the REST API (balances, transactions)
3. Catch business inconsistencies (balances mismatch, double-debit, stale sessions)
4. Keep the suite deterministic on a **shared public environment**

### Out of scope

- Load / performance
- Security testing (the admin page is off-limits)
- Multi-browser (Chromium only)
- Forgot password, profile update, pure informational pages

---

## 2. Scope

| Component                 | Tested? | Level         |
| ------------------------- | ------- | ------------- |
| Register form             | ✅      | UI + business |
| Login / logout            | ✅      | UI            |
| Accounts overview         | ✅      | UI + API      |
| Open new account          | ✅      | UI + API      |
| Transfer funds            | ✅      | UI + API      |
| Bill Pay                  | 🎯      | V2            |
| Request Loan              | 🎯      | V2            |
| Find Transactions         | 🎯      | V2            |
| Update Contact Info       | ⬜      | not valuable  |
| Admin / reset DB          | 🚫      | forbidden (shared env) |

---

## 3. Risk methodology (FMEA light)

Same methodology as the Stripe exercise: each risk gets three independent scores, multiplied into a criticality. Detectability weighs as much as probability — silent bugs rise to the top.

### 3.1 Probability (P)

| Level     | Criterion                                                         | Score |
| --------- | ----------------------------------------------------------------- | ----- |
| 🟢 Low    | Uses well-tested framework paths, no custom logic                 | **1** |
| 🟡 Medium | Custom app logic OR depends on user input shape                   | **2** |
| 🔴 High   | Depends on user timing, concurrency, or known unstable areas     | **3** |

### 3.2 Impact (I)

| Level       | Criterion                                                        | Score |
| ----------- | ---------------------------------------------------------------- | ----- |
| 🟢 Low      | Cosmetic / retryable with no state damage                        | **1** |
| 🟡 Medium   | User can't complete their task without support                   | **2** |
| 🔴 Critical | Balance inconsistency, lost money, unauthorized access           | **3** |

### 3.3 Detectability (D)

Higher = harder to detect = worse score.

| Level       | Criterion                                                        | Score |
| ----------- | ---------------------------------------------------------------- | ----- |
| 🟢 High     | Crashes, 500, or visible error                                   | **1** |
| 🟡 Medium   | Visible in logs or via API cross-check                           | **2** |
| 🔴 Low      | Silent: UI says OK but balance/transactions are wrong            | **3** |

### 3.4 Criticality → priority

```
Criticality = P × I × D       (range 1 → 27)
```

| Criticality | Priority | Treatment                                |
| ----------- | -------- | ---------------------------------------- |
| **1–6**     | **P2**   | Nice to have                             |
| **7–17**    | **P1**   | Must cover                               |
| **18–27**   | **P0**   | Mandatory, CI-blocking                   |

---

## 4. Risk matrix

| ID  | Risk                                                          | P | I | D | Crit. | Prio | Justification                                                        |
| --- | ------------------------------------------------------------- | - | - | - | ----- | ---- | -------------------------------------------------------------------- |
| R1  | Transfer debits source but does not credit destination       | 2 | 3 | 3 | **18**| P0   | Custom handler (P=2), money lost (I=3), silent if only UI checked    |
| R2  | Transfer allows amount > source balance                      | 2 | 3 | 2 | **12**| P1   | Custom validation (P=2), overdraft (I=3), visible via API            |
| R3  | Double-submit transfer → debit × 2                           | 3 | 3 | 2 | **18**| P0   | Common user behavior (P=3), money impact (I=3), visible in tx list   |
| R4  | Registration with duplicate username silently succeeds       | 1 | 2 | 3 | **6** | P2   | Unlikely (P=1), but silent collision could create two users          |
| R5  | Login with invalid credentials lets the user in              | 1 | 3 | 1 | **3** | P2   | Framework-level (P=1), visible if broken (D=1), but high impact      |
| R6  | Session survives logout (back button still shows data)      | 2 | 3 | 2 | **12**| P1   | Cached pages (P=2), unauthorized access (I=3), detectable on retry   |
| R7  | Open Account doesn't update overview balance                 | 2 | 2 | 3 | **12**| P1   | Sync issue (P=2), UX broken (I=2), silent (D=3)                      |
| R8  | Transfer succeeds with negative or zero amount               | 2 | 2 | 2 | **8** | P1   | Weak client validation (P=2), corrupts tx history (I=2)              |
| R9  | Tests themselves are flaky (false negatives)                 | 3 | 2 | 2 | **12**| P1   | Shared env + server-render (P=3), tests get ignored (I=2)            |
| R10 | Username collision between concurrent test runs              | 3 | 1 | 1 | **3** | P2   | Very likely on shared env (P=3), only causes test noise (I=1)        |
| R11 | Registration accepts obviously invalid data (SSN, ZIP, state)| 3 | 1 | 1 | **3** | P2   | Confirmed in exploration (P=3), low downstream impact                |
| R12 | REST API returns different state than UI                     | 1 | 3 | 3 | **9** | P1   | Unlikely (P=1), but critical to detect if happens (I=3, D=3)         |

---

## 5. Probability × Impact heatmap

```
               Impact →
               Low (1)        Medium (2)      Critical (3)
             ┌──────────────┬──────────────┬──────────────┐
   High (3)  │ R10, R11     │ R9           │ R3           │
             │ 🟢 P2        │ 🟠 P1        │ 🔴 P0        │
             ├──────────────┼──────────────┼──────────────┤
   Medium(2) │              │ R7, R8       │ R1, R2, R6   │
             │              │ 🟠 P1        │ 🔴/🟠 P0/P1  │
             ├──────────────┼──────────────┼──────────────┤
   Low (1)   │              │ R4           │ R5, R12      │
             │              │ 🟢 P2        │ 🟢/🟠 P2/P1  │
             └──────────────┴──────────────┴──────────────┘
```

**Reading**: R3 (double-submit) lands in the top-right and is a P0 — a user who clicks twice on Transfer is both **likely** and **catastrophic**. R10 (username collisions) is likely but low-impact, so we mitigate it via the `userFactory` rather than with a dedicated test.

---

## 6. Test cases

### TC-01 — Register + auto-login ✅

- **Priority**: P0 · **Covers**: R4 (partial), R11 · **File**: `tests/register.spec.ts`

**Steps**
1. Generate a unique user (`userFactory`)
2. Open `/parabank/register.htm`
3. Fill all 11 required fields
4. Submit
5. Wait for redirect to `/overview.htm`

**Assertions**
- URL matches `/overview.htm`
- Greeting "Welcome <firstName> <lastName>" visible
- At least one account visible in the overview table
- **Business**: GET `/customers/{id}/accounts` returns the same account list (cross-check)

---

### TC-02 — Login / logout happy path ✅

- **Priority**: P0 · **Covers**: R5, R6 · **File**: `tests/login.spec.ts`

**Steps**
1. Register a fresh user (fixture)
2. Logout
3. Login back with the same credentials
4. Verify overview is reachable
5. Logout again
6. Try to navigate to `/overview.htm` directly (back-button simulation)

**Assertions**
- After login: overview visible, greeting correct
- After logout: redirected to homepage, login form visible
- After logout + direct navigation: **not authorized** (redirected to homepage or error shown)

---

### TC-03 — Login with invalid credentials ✅

- **Priority**: P1 · **Covers**: R5 · **File**: `tests/login.spec.ts`

**Steps**
1. Go to homepage
2. Fill login form with a clearly invalid username/password
3. Submit

**Assertions**
- Still on homepage (or `/login.htm` error page)
- Error message visible ("could not be verified" or equivalent)
- URL does **not** match `/overview.htm`

---

### TC-04 — Transfer funds (UI + API cross-check) ✅

- **Priority**: P0 · **Covers**: R1, R2, R7, R8 · **File**: `tests/transfer.spec.ts`

**Steps**
1. Register a fresh user (fixture)
2. Note the default account ID and balance
3. Open a second CHECKING account (funded from the first)
4. Read the new balances of both accounts (UI + API)
5. Transfer $25 from account #1 to account #2
6. Read balances again

**Assertions**
- Confirmation page shows the correct amount, source, destination
- Account #1 balance **decreased by exactly $25**
- Account #2 balance **increased by exactly $25**
- API `/accounts/{id}` for both accounts returns matching balances (cross-check vs UI)
- Transaction appears in `/accounts/{id}/transactions` for both accounts

---

### TC-05 — Bill Pay (V2)

- **Priority**: P1 · **Covers**: R1, R8
- Pay a mocked payee, assert on payer balance decrease and transaction entry.

### TC-06 — Request Loan (V2)

- **Priority**: P1 · **Covers**: (no direct R, but validates loan branch logic)
- Two branches: approved (down payment high enough) and denied.

### TC-07 — Find Transactions by date (V2)

- **Priority**: P2 · **Covers**: R12
- Seed 2 transactions via UI, then filter by date range and assert on the filtered table.

### TC-08 — Double-submit Transfer ⚠️ PINNED BUG

- **Priority**: P0 · **Covers**: R3 · **File**: `tests/transfer-double-submit.spec.ts`

**Steps**
1. Register fresh user, open a second account
2. Fire **two concurrent POSTs** to the real transfer endpoint
   (`/parabank/services_proxy/bank/transfer?fromAccountId=...&toAccountId=...&amount=...`)
3. Re-read the source balance from the overview page

**Assertion**
- `balanceBefore - balanceAfter === amount` (one debit, not two)

**Status — ParaBank is NOT idempotent.** Confirmed empirically: two concurrent
POSTs both return 200, both debit the source. The assertion above fails with
`debited = 2 * amount`. The test is therefore pinned with `test.fail()` so the
suite stays green while documenting the defect. If ParaBank ever fixes it, the
test will flip to red and the pin will need to be removed.

---

## 7. Anti-flaky strategy

> A flaky test isn't a test, it's noise — high false-negative rate, low detectability (people learn to ignore it). It's a risk (R9) and we treat it accordingly.

### The 5 non-negotiable rules

| # | Rule                                                  | Playwright mechanism                                                 |
| - | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 1 | **Zero `waitForTimeout()`**                           | `expect(locator).toBeVisible()` with native auto-retry               |
| 2 | **Zero uncontrolled network**                         | API cross-check uses explicit `request.get()`, not passive wait      |
| 3 | **Zero shared state between tests**                   | Per-test fixture generates a fresh user via `userFactory`            |
| 4 | **Zero fragile selectors**                            | `getByRole` / `getByLabel` only                                      |
| 5 | **Zero decorative assertions**                        | Assert on URL, API responses, balances — not on greeting text alone  |

### Per-TC determinism

| TC    | Flakiness risks                                  | Mitigation                                                          |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------- |
| TC-01 | Slow server render of the overview page          | `waitForURL(/overview.htm/)` + wait for account row to be visible   |
| TC-02 | Session cache on back navigation                 | Explicit `page.goto('/parabank/overview.htm')` after logout         |
| TC-03 | Error message location changes                   | Match on `getByText(/could not be verified/i)`                      |
| TC-04 | Balance parsing (`$123.45`)                      | Centralized parser in the POM, asserted on a normalized number      |
| TC-08 | Race condition on double-click                   | `Promise.all([click, click])` then API assertion on count           |

### Validation

- **Merge threshold**: 10/10 on 10 consecutive runs
- **No `test.retry()`** used to mask flakiness
- Health check in `globalSetup` (retry 10×500ms) before anything runs

---

## 8. Setup / teardown

**No global `beforeEach`/`afterEach`.** Playwright fixtures do the job cleanly.

| Scope         | Mechanism                   | Usage                                                            |
| ------------- | --------------------------- | ---------------------------------------------------------------- |
| Global        | `globalSetup`               | Health check on `https://parabank.parasoft.com` (retry, idempotent) |
| Test-scope    | Fixture `registeredUser`    | Creates a unique user via the UI, returns credentials + customer ID |
| Test-scope    | Fixture `authedPage`        | A page already logged in as `registeredUser`                     |
| Test-scope    | Fixture `api`               | `APIRequestContext` pointed at `:8080` for cross-validation      |

**Teardown**: we **do not** delete created users — ParaBank doesn't expose the endpoint, and the data accumulation on a demo site is acceptable. This is documented and owned.

---

## 9. Risk → test traceability

| Risk | Crit.    | Covered by          | Status    |
| ---- | -------- | ------------------- | --------- |
| R1   | 18 (P0)  | TC-04 (UI + API)    | ✅        |
| R2   | 12 (P1)  | TC-04 extension     | ✅        |
| R3   | 18 (P0)  | TC-08               | ⚠️ PINNED (confirmed bug) |
| R4   | 6 (P2)   | TC-01 (partial)     | ✅        |
| R5   | 3 (P2)   | TC-02, TC-03        | ✅        |
| R6   | 12 (P1)  | TC-02               | ✅        |
| R7   | 12 (P1)  | TC-04               | ✅        |
| R8   | 8 (P1)   | TC-04 extension     | 🎯 V2     |
| R9   | 12 (P1)  | CI 10× run          | ✅        |
| R10  | 3 (P2)   | `userFactory`       | ✅ (mitig)|
| R11  | 3 (P2)   | documented, not tested | ✅ (mitig)|
| R12  | 9 (P1)   | TC-04 (UI re-read)  | ⚠️ degraded — see note below |

---

## 10. Acceptance criteria

| Criterion                                                  | Threshold  |
| ---------------------------------------------------------- | ---------- |
| Pass rate on 10 consecutive runs                           | **100%**   |
| Total suite duration                                       | < 90s      |
| Zero `waitForTimeout()` without justification              | ✅         |
| Zero generated CSS selectors                               | ✅         |
| Every P0 has at least one API cross-check                  | ✅         |
| Every P0/P1 risk traced to at least one TC or mitigation   | ✅         |
| Zero `test.retry()` used to mask flakiness                 | ✅         |

---

### Note on R12 (REST cross-check, degraded)

The original plan called for asserting balances via the REST API on port `:8080`
as an independent cross-check of the UI. Two empirical findings forced a pivot:

1. **`http://parabank.parasoft.com:8080` returns HTTP 522** (Cloudflare origin
   unreachable). The documented port is dead from the public internet.
2. **`https://parabank.parasoft.com/parabank/services/bank/*` requires a session
   cookie** and returns 400/401 for unauthenticated calls. It's reachable via
   `page.request` (which shares the logged-in context's cookies), but the
   contract isn't well-documented and responses are inconsistent.

**Mitigation**: TC-04 now cross-validates by **re-reading the overview page**
after the transfer — a second HTTP round-trip, a different rendered state, and
still a real server-side confirmation. Less ideal than an independent API layer,
but strictly better than asserting only on the confirmation page.

TC-08, on the other hand, **does hit the real JSON endpoint**
(`/parabank/services_proxy/bank/transfer`) because we discovered it by reverse-
engineering the transfer form's jQuery submit handler. That endpoint is what the
app itself uses. If we needed REST assertions in more tests, we'd factor that
prefix into a helper.

---

## 11. Assumptions & limits

1. **Initial probabilities** are hypotheses from manual exploration, **not** from incident history. Revise after 30 days of stable CI.
2. **Shared public environment** — we accept some risks we'd never accept in prod (no user cleanup, potential data pollution from other users).
3. **The 1–3 scoring scale** is intentionally coarse: 12 risks don't need 1–10 granularity.
4. **No "mitigation cost" axis** — all tests are in the same order of magnitude of effort.
5. **REST API is assumed stable** because it's public and documented, but if it flakes in CI we fall back to UI-only assertions and downgrade R12 coverage.
6. **Plan is a living document** — revise after every red CI run that reveals a blind spot.
