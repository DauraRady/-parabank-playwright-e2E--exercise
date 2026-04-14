import { test, expect } from '../fixtures';
import { ParabankPage } from '../pages/parabankPage';

test.describe('TC-02 — Login / logout happy path', () => {
  test('a registered user can log out and log back in', async ({
    parabank,
    registeredUser,
    page,
  }) => {
    await parabank.logout();
    await expect(page).toHaveURL(/index\.htm/);
    await expect(parabank.loginHeading()).toBeVisible();

    await parabank.login(registeredUser.username, registeredUser.password);
    await expect(page).toHaveURL(/overview\.htm/);
    await expect(parabank.loggedInHeading()).toBeVisible();
  });
});

test.describe('TC-03 — Login with invalid credentials', () => {
  test('rejects a clearly invalid username/password', async ({ page }) => {
    const parabank = new ParabankPage(page);
    await parabank.login('pw_invalid_user_xyz', 'wrong-password');

    await expect(page).not.toHaveURL(/overview\.htm/);
    await expect(parabank.loginError()).toBeVisible();
  });
});
