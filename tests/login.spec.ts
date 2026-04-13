import { test, expect } from '../fixtures';
import { ParabankPage } from '../helpers/parabankPage';

test.describe('TC-02 — Login / logout happy path', () => {
  test('a registered user can log out and log back in', async ({
    parabank,
    registeredUser,
  }) => {
    await parabank.logout();
    await parabank.expectLoggedOut();

    await parabank.login(registeredUser.username, registeredUser.password);
    await parabank.expectLoggedIn();
  });
});

test.describe('TC-03 — Login with invalid credentials', () => {
  test('rejects a clearly invalid username/password', async ({ page }) => {
    const parabank = new ParabankPage(page);
    await parabank.login('pw_invalid_user_xyz', 'wrong-password');

    await expect(page).not.toHaveURL(/overview\.htm/);
    await parabank.expectLoginError();
  });
});
