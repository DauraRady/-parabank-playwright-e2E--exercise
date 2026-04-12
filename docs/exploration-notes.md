# ParaBank — Exploration Notes

> Manual exploration log of [ParaBank](https://parabank.parasoft.com) used as the basis for the [test plan](test-plan.md).
> Goal: capture what the site actually does before inventing tests for it.

---

## 1. Site map

| Route                                  | Purpose                                    | Auth |
| -------------------------------------- | ------------------------------------------ | ---- |
| `/parabank/index.htm`                  | Homepage with login form                   | ⬜   |
| `/parabank/register.htm`               | Customer registration                      | ⬜   |
| `/parabank/lookup.htm`                 | Forgot login info                          | ⬜   |
| `/parabank/overview.htm`               | Accounts overview (after login)            | ✅   |
| `/parabank/openaccount.htm`            | Open new account                           | ✅   |
| `/parabank/transfer.htm`               | Transfer funds between accounts            | ✅   |
| `/parabank/billpay.htm`                | Bill Pay                                   | ✅   |
| `/parabank/findtrans.htm`              | Find transactions by criteria              | ✅   |
| `/parabank/updateprofile.htm`          | Update customer profile                    | ✅   |
| `/parabank/requestloan.htm`            | Request loan                               | ✅   |
| `/parabank/services.htm`               | Public API documentation                   | ⬜   |
| `/parabank/admin.htm`                  | Admin / reset DB (shared env — do not use) | ⬜   |

### Left sidebar (authenticated)

- Open New Account
- Accounts Overview
- Transfer Funds
- Bill Pay
- Find Transactions
- Update Contact Info
- Request Loan
- Log Out

---

## 2. REST API surface

Base: `http://parabank.parasoft.com:8080/parabank/services/bank`
(Note the port `:8080` — different host from the UI.)

- OpenAPI docs: `http://parabank.parasoft.com:8080/parabank/api-docs/index.html`
- WADL: `http://parabank.parasoft.com:8080/parabank/services/bank?_wadl&_type=xml`

Useful operations observed:
- `GET /customers/{id}/accounts` — list accounts for a customer
- `GET /accounts/{id}` — fetch account details (including balance)
- `GET /accounts/{id}/transactions` — transaction history
- `POST /transfer` — transfer funds (query params `fromAccountId`, `toAccountId`, `amount`)
- `POST /requestLoan` — request a loan

> 💡 Usage strategy: **don't replace the UI flow with API calls**, but use the API for **cross-validation** (assert balances/transactions after a UI action).

---

## 3. Forms observed

### 3.1 Login (homepage)

- Fields: **Username**, **Password** (both required)
- Submit button labelled "Log In"
- Error on bad credentials: stays on homepage with error text like "The username and password could not be verified."

### 3.2 Registration (`/register.htm`)

11 required fields, all text inputs except the two passwords:

| Label            | Type      | Notes                                        |
| ---------------- | --------- | -------------------------------------------- |
| First Name       | text      |                                              |
| Last Name        | text      |                                              |
| Address          | text      | single line, no street 2                     |
| City             | text      |                                              |
| State            | text      | free text, no dropdown                       |
| Zip Code         | text      | no format check observed                     |
| Phone #          | text      | accepts anything                             |
| SSN              | text      | free text, not validated as real SSN         |
| Username         | text      | must be unique across the whole shared DB    |
| Password         | password  |                                              |
| Confirm          | password  | must match Password                          |

Submit button: "Register". On success, the user is **auto-logged in** and redirected to `/overview.htm` with a greeting message.

### 3.3 Transfer Funds (`/transfer.htm`)

- Field: **Amount** (text)
- Dropdown: **From account** (populated from the user's accounts)
- Dropdown: **To account** (populated from the user's accounts)
- Button: "Transfer"
- On success: confirmation page with amount, source, destination, timestamp

### 3.4 Open New Account (`/openaccount.htm`)

- Dropdown: account type (CHECKING / SAVINGS)
- Dropdown: source account to fund the new one
- Button: "Open New Account"
- Initial deposit: **$100** (constant — observed behavior)

---

## 4. Observed quirks & constraints

| # | Observation                                                                     | Impact on tests                                             |
| - | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1 | Shared public DB — usernames collide if tests reuse them                        | Must generate unique usernames (timestamp + random suffix)  |
| 2 | No teardown/delete user endpoint                                                | Data accumulates — accept it, don't try to clean up         |
| 3 | Site can go down or be slow (public demo)                                       | Health check in `globalSetup` with retry                    |
| 4 | REST API runs on port **:8080**, different from UI                              | Two base URLs needed                                        |
| 5 | Some pages render with slow server-side rendering                               | Rely on Playwright auto-wait, not hardcoded timeouts        |
| 6 | State dropdown is a free-text field, no validation                              | Can submit "ZZ" — test plan should flag this as a risk      |
| 7 | SSN is free text, no real validation                                            | Same — risk of low data integrity                           |
| 8 | Successful Register auto-logs-in the user                                       | Simplifies TC-01 (no need for a separate login)             |
| 9 | Admin page (`/admin.htm`) can reset the DB — **never call from tests**         | Could wipe other users mid-run                              |
| 10| No rate limiting observed, but don't stress-test a public demo                  | Keep the suite under ~60s total                             |

---

## 5. What we chose NOT to automate (and why)

- **Forgot password** (`/lookup.htm`) — requires knowing the original answers; low value for a practice suite
- **Update Contact Info** — trivial form, low business risk
- **Admin Page** — dangerous on a shared environment
- **Real SSN / phone validation** — not actually validated server-side, so nothing to assert

---

## 6. Open questions (to investigate later)

- Does Transfer enforce "amount ≤ source balance" server-side, or only client-side? → **Test it** in TC-04
- Is the Loan approval deterministic given income/down payment? → **Test two branches** in TC-06
- Does Bill Pay validate the payee account number? → **Test with garbage payee** in TC-05
- Does a double-submit on Transfer create two transactions? → **Test it** (risk R3 in the plan)
