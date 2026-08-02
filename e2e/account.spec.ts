import { expect, test, type Page } from '@playwright/test';

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-123';

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Username or email').fill(ADMIN_USERNAME);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('navigation', { name: 'Rooms' })).toBeVisible();
};

const openAccountMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'Account and status' }).click();
  return page.getByRole('menu');
};

test('sets presence from the account menu and keeps it', async ({ page }) => {
  await signIn(page);

  await (await openAccountMenu(page)).getByRole('menuitemradio', { name: 'Busy' }).click();

  // The menu closes on select, so the assertion has to reopen it: what matters
  // is that the choice came back from the gateway, not that a local radio
  // flipped.
  await expect((await openAccountMenu(page)).getByRole('menuitemradio', { name: 'Busy' })).toBeChecked();
  await page.keyboard.press('Escape');

  // A reload proves the presence reached Rocket.Chat rather than living in the
  // page's own state.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Rooms' })).toBeVisible();
  await expect((await openAccountMenu(page)).getByRole('menuitemradio', { name: 'Busy' })).toBeChecked();

  await page.getByRole('menuitemradio', { name: 'Online' }).click();
  await expect((await openAccountMenu(page)).getByRole('menuitemradio', { name: 'Online' })).toBeChecked();
  await page.keyboard.press('Escape');
});

test('sets and clears the status message', async ({ page }) => {
  await signIn(page);

  const text = `playwright ${Date.now()}`;

  await (await openAccountMenu(page)).getByRole('menuitem', { name: 'Set a status message' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Status message' }).fill(text);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // The message replaces the server line under the user's name, which is the
  // only place it shows without opening anything.
  await expect(page.getByRole('button', { name: 'Account and status' })).toContainText(text);

  await (await openAccountMenu(page)).getByRole('menuitem', { name: text }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();

  await expect(page.getByRole('button', { name: 'Account and status' })).not.toContainText(text);
});

test('signs out from the account menu', async ({ page }) => {
  await signIn(page);

  await (
    await openAccountMenu(page)
  )
    .getByRole('menuitem', { name: /^Sign out/ })
    .last()
    .click();

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // The session cookie has to be gone with it, or a reload would walk straight
  // back into the app.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
