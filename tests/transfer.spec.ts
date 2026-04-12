import { test, expect } from '../helpers/fixtures';

test.describe('TC-04 — Transfer funds (UI balance cross-check)', () => {
  test('debits the source and credits the destination by the exact amount', async ({
    authedPage,
    page,
  }) => {
    const sourceAccountIds = await authedPage.accountIdsFromOverview();
    const sourceAccountId = sourceAccountIds[0];
    expect(sourceAccountId).toBeDefined();

    const destinationAccountId = await authedPage.openNewCheckingAccount(sourceAccountId);
    expect(destinationAccountId).not.toEqual(sourceAccountId);

    const sourceBefore = await authedPage.getBalanceFromOverview(sourceAccountId);
    const destBefore = await authedPage.getBalanceFromOverview(destinationAccountId);

    const amount = 25;
    await authedPage.transfer(amount, sourceAccountId, destinationAccountId);

    await expect(page.locator('#amountResult')).toHaveText(`$${amount}.00`);
    await expect(page.locator('#fromAccountIdResult')).toHaveText(sourceAccountId);
    await expect(page.locator('#toAccountIdResult')).toHaveText(destinationAccountId);

    const sourceAfter = await authedPage.getBalanceFromOverview(sourceAccountId);
    const destAfter = await authedPage.getBalanceFromOverview(destinationAccountId);

    expect(sourceAfter).toBeCloseTo(sourceBefore - amount, 2);
    expect(destAfter).toBeCloseTo(destBefore + amount, 2);
  });
});
