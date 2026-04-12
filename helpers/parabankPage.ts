import { Page, expect } from '@playwright/test';
import { NewUser } from './userFactory';

export class ParabankPage {
  constructor(private readonly page: Page) {}

  async goHome() {
    await this.page.goto('/parabank/index.htm');
  }

  async goRegister() {
    await this.page.goto('/parabank/register.htm');
  }

  async register(user: NewUser) {
    await this.goRegister();
    // Labels aren't associated via <label for>, so we target by stable id.
    await this.page.locator('#customer\\.firstName').fill(user.firstName);
    await this.page.locator('#customer\\.lastName').fill(user.lastName);
    await this.page.locator('#customer\\.address\\.street').fill(user.address);
    await this.page.locator('#customer\\.address\\.city').fill(user.city);
    await this.page.locator('#customer\\.address\\.state').fill(user.state);
    await this.page.locator('#customer\\.address\\.zipCode').fill(user.zipCode);
    await this.page.locator('#customer\\.phoneNumber').fill(user.phone);
    await this.page.locator('#customer\\.ssn').fill(user.ssn);
    await this.page.locator('#customer\\.username').fill(user.username);
    await this.page.locator('#customer\\.password').fill(user.password);
    await this.page.locator('#repeatedPassword').fill(user.password);
    await this.page.locator('input[type="submit"][value="Register"]').click();
    // ParaBank doesn't redirect after register — it re-renders register.htm with a
    // success message. Wait for that, then navigate to overview explicitly so every
    // caller starts from the same known state.
    await expect(
      this.page.getByText(/your account was created successfully/i),
    ).toBeVisible();
    await this.page.goto('/parabank/overview.htm');
  }

  async login(username: string, password: string) {
    await this.goHome();
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole('button', { name: /log in/i }).click();
  }

  async logout() {
    await this.page.getByRole('link', { name: /log out/i }).click();
    await this.page.waitForURL(/index\.htm/);
  }

  async expectLoggedIn() {
    await expect(this.page).toHaveURL(/overview\.htm/);
    await expect(this.page.getByRole('heading', { name: /accounts overview/i })).toBeVisible();
  }

  async expectLoggedOut() {
    await expect(this.page).toHaveURL(/index\.htm/);
    await expect(this.page.getByRole('heading', { name: /customer login/i })).toBeVisible();
  }

  async expectLoginError() {
    await expect(this.page.getByText(/could not be verified/i)).toBeVisible();
  }

  /**
   * Returns the list of account IDs visible on the overview page.
   * ParaBank renders each account ID as a link in the first column.
   */
  async accountIdsFromOverview(): Promise<string[]> {
    await this.page.goto('/parabank/overview.htm');
    const rows = this.page.locator('#accountTable tbody tr');
    await expect(rows.first()).toBeVisible();
    const links = rows.locator('td').first().locator('a');
    const count = await links.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await links.nth(i).innerText()).trim();
      if (/^\d+$/.test(text)) ids.push(text);
    }
    return ids;
  }

  async openNewCheckingAccount(fromAccountId: string): Promise<string> {
    await this.page.goto('/parabank/openaccount.htm');
    await this.page.locator('#type').selectOption('0'); // CHECKING
    await this.page.locator('#fromAccountId').selectOption(fromAccountId);
    await this.page.getByRole('button', { name: /open new account/i }).click();
    const newAccountLink = this.page.locator('#newAccountId');
    await expect(newAccountLink).toBeVisible();
    return (await newAccountLink.innerText()).trim();
  }

  /**
   * Reads all account balances from a single overview page visit.
   * Returns a Map<accountId, balance>. Prefer this when you need more
   * than one balance — two concurrent page.goto calls on the same page
   * abort each other (net::ERR_ABORTED).
   */
  async getAllBalancesFromOverview(): Promise<Map<string, number>> {
    await this.page.goto('/parabank/overview.htm');
    const rows = this.page.locator('#accountTable tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    const balances = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const idText = (await row.locator('td').nth(0).innerText()).trim();
      const balanceText = (await row.locator('td').nth(1).innerText()).trim();
      if (/^\d+$/.test(idText)) {
        balances.set(idText, Number(balanceText.replace(/[$,\s]/g, '')));
      }
    }
    return balances;
  }

  /**
   * Re-reads the overview page and returns the balance for a given account id.
   * Parses the ParaBank "$1,234.56" format into a number.
   */
  async getBalanceFromOverview(accountId: string): Promise<number> {
    await this.page.goto('/parabank/overview.htm');
    const row = this.page.locator('#accountTable tbody tr', {
      has: this.page.locator(`a:has-text("${accountId}")`),
    });
    await expect(row).toBeVisible();
    const balanceText = (await row.locator('td').nth(1).innerText()).trim();
    return Number(balanceText.replace(/[$,\s]/g, ''));
  }

  async transfer(amount: number, fromAccountId: string, toAccountId: string) {
    await this.page.goto('/parabank/transfer.htm');
    await this.page.locator('#amount').fill(amount.toString());
    await this.page.locator('#fromAccountId').selectOption(fromAccountId);
    await this.page.locator('#toAccountId').selectOption(toAccountId);
    await this.page.getByRole('button', { name: /transfer/i }).click();
    await expect(this.page.getByRole('heading', { name: /transfer complete/i })).toBeVisible();
  }
}
