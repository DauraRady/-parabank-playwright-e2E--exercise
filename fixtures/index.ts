import { test as base, APIRequestContext, request, expect } from '@playwright/test';
import { ParabankPage } from '../pages/parabankPage';
import { newUser, NewUser } from '../helpers/userFactory';

type Fixtures = {
  parabank: ParabankPage;
  registeredUser: NewUser;
  authedPage: ParabankPage;
  api: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  parabank: async ({ page }, use) => {
    await use(new ParabankPage(page));
  },

  registeredUser: async ({ page }, use) => {
    const user = newUser();
    const pom = new ParabankPage(page);
    await pom.register(user);
    await use(user);
  },

  authedPage: async ({ parabank, registeredUser }, use) => {
    await expect(parabank.loggedInHeading()).toBeVisible();
    await use(parabank);
  },

  api: async ({}, use) => {
    const ctx = await request.newContext({
      baseURL: 'http://parabank.parasoft.com:8080',
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from '@playwright/test';
