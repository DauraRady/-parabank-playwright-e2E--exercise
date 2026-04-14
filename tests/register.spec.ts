import { test, expect } from '../fixtures';
import { newUser } from '../helpers/userFactory';
import { ParabankPage } from '../pages/parabankPage';

test.describe('TC-01 — Register', () => {
  test('registers a new user and lands on the accounts overview', async ({ page }) => {
    const user = newUser();
    const parabank = new ParabankPage(page);

    await parabank.register(user);

    await expect(page).toHaveURL(/overview\.htm/);
    await expect(
      page.getByText(new RegExp(`welcome\\s+${user.firstName}`, 'i')),
    ).toBeVisible();

    const accountIds = await parabank.accountIdsFromOverview();
    expect(accountIds.length).toBeGreaterThan(0);
  });
});
