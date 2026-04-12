import { test, expect } from '../helpers/fixtures';

/**
 * TC-08 — Double-submit transfer (risk R3)
 *
 * Simulates two concurrent transfer POSTs. A safe backend must debit the
 * source account only ONCE regardless of how many requests arrive in the
 * race window.
 *
 * ⚠️ KNOWN BUG: ParaBank has no idempotency guard — both POSTs succeed
 * and the source is debited twice. We pin this behavior with test.fail()
 * so the suite stays green while documenting the defect. If ParaBank is
 * ever fixed, this test will flip to red and we'll update the pin.
 */
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

    // Safe behavior: exactly one debit.
    // If this fails with ~2 * amount, ParaBank is double-debiting.
    expect(debited).toBeCloseTo(amount, 2);
  },
  );
});
