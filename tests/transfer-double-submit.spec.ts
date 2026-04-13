import { test, expect } from '../fixtures';

test.describe('TC-08 — Double-submit transfer (risk R3)', () => {
  test.fail(
    'two concurrent transfer POSTs must not debit the source twice (PINNED: ParaBank double-debits)',
    async ({ authedPage, page }) => {
    const [sourceAccountId] = await authedPage.accountIdsFromOverview();
    const destinationAccountId =
      await authedPage.openNewCheckingAccount(sourceAccountId);

    const balanceBefore = await authedPage.getBalanceFromOverview(sourceAccountId);

    const amount = 5;
    const url =
      `/parabank/services_proxy/bank/transfer` +
      `?fromAccountId=${sourceAccountId}` +
      `&toAccountId=${destinationAccountId}` +
      `&amount=${amount}`;

    const [res1, res2] = await Promise.all([
      page.request.post(url),
      page.request.post(url),
    ]);

    expect(res1.ok()).toBeTruthy();
    expect(res2.ok()).toBeTruthy();

    const balanceAfter = await authedPage.getBalanceFromOverview(sourceAccountId);
    const debited = balanceBefore - balanceAfter;

    expect(debited).toBeCloseTo(amount, 2);
  },
  );
});
