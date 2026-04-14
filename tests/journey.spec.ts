import { test, expect } from '../fixtures';
import { newUser } from '../helpers/userFactory';
import { ParabankPage } from '../pages/parabankPage';

/**
 * TC-09 — Full banking journey
 *
 * A long-running end-to-end happy path that chains the main customer
 * actions in a single test, instrumented with test.step so each phase
 * shows up as a collapsible section in the HTML report.
 *
 * Patterns demonstrated:
 *   - test.step for readable multi-phase tests
 *   - expect.poll for eventual-consistency on the transaction history
 *   - Promise.all for parallel balance reads
 *   - full journey coverage (Register → Open → Transfer → History)
 */
test.describe('TC-09 — Full banking journey', () => {
  test('register, open account, transfer funds, find the transaction in history', async ({
    page,
  }) => {
    const user = newUser();
    const parabank = new ParabankPage(page);

    let sourceAccountId!: string;
    let destinationAccountId!: string;
    const amount = 17;

    await test.step('Register a fresh user and land on the overview', async () => {
      await parabank.register(user);
      await expect(page).toHaveURL(/overview\.htm/);
      await expect(parabank.loggedInHeading()).toBeVisible();
      const accountIds = await parabank.accountIdsFromOverview();
      expect(accountIds.length).toBeGreaterThan(0);
      sourceAccountId = accountIds[0];
    });

    await test.step('Open a second checking account', async () => {
      destinationAccountId = await parabank.openNewCheckingAccount(sourceAccountId);
      expect(destinationAccountId).not.toEqual(sourceAccountId);
    });

    const balancesBefore = await test.step(
      'Snapshot both balances in a single overview read',
      async () => parabank.getAllBalancesFromOverview(),
    );
    const sourceBefore = balancesBefore.get(sourceAccountId)!;
    const destBefore = balancesBefore.get(destinationAccountId)!;

    await test.step(`Transfer $${amount} between the two accounts`, async () => {
      await parabank.transfer(amount, sourceAccountId, destinationAccountId);
      await expect(page.locator('#amountResult')).toHaveText(`$${amount}.00`);
    });

    await test.step('Verify both balances updated by exactly the amount', async () => {
      const balancesAfter = await parabank.getAllBalancesFromOverview();
      expect(balancesAfter.get(sourceAccountId)!).toBeCloseTo(sourceBefore - amount, 2);
      expect(balancesAfter.get(destinationAccountId)!).toBeCloseTo(destBefore + amount, 2);
    });

    await test.step(
      'Poll the transactions REST endpoint until the transfer appears',
      async () => {
        // Demonstrates expect.poll for eventual consistency. ParaBank is
        // synchronous in practice, but this is the canonical pattern for
        // webhook-driven state or async pipelines.
        // The endpoint is the one the UI itself uses via jQuery AJAX.
        const url =
          `/parabank/services_proxy/bank/accounts/${sourceAccountId}` +
          `/transactions/month/All/type/Debit`;

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
              intervals: [250, 500, 1000],
              message: `Expected a debit of $${amount} to appear in account ${sourceAccountId}`,
            },
          )
          .toBeGreaterThan(0);
      },
    );
  });
});
