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

/**
 * The connection banner.
 *
 * Identified by the Retry button it contains rather than by its role alone:
 * toasts are live regions too, and one can be on screen during an outage.
 */
const banner = (page: Page) => page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Retry' }) });

/** The sidebar footer, which is where the app says the socket is up. */
const connected = (page: Page) => page.getByText('Connected');

test('says the app is offline and recovers when the network comes back', async ({ page, context }) => {
  await signIn(page);
  await expect(connected(page)).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);

  // "You are offline" rather than "connection lost": when the browser itself
  // reports no network, that is the part the user can act on.
  await expect(banner(page)).toBeVisible({ timeout: 20_000 });
  await expect(banner(page).getByText('You are offline')).toBeVisible();
  await expect(banner(page).getByRole('button', { name: 'Retry' })).toBeEnabled();

  await context.setOffline(false);

  // Recovery is not a matter of waiting: the app retries on the browser's
  // `online` event rather than sitting out a backoff that had grown to fifteen
  // seconds while the machine was asleep.
  await expect(banner(page)).toBeHidden({ timeout: 20_000 });
  await expect(connected(page)).toBeVisible({ timeout: 20_000 });
});

test('counts down to the next attempt and lets Retry skip the wait', async ({ page }) => {
  await signIn(page);
  await expect(connected(page)).toBeVisible({ timeout: 20_000 });

  // Every socket from here on is refused the moment it opens, which puts the
  // client into the backoff loop the banner exists for.
  let attempts = 0;
  await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    attempts += 1;
    ws.close();
  });

  // The live socket predates the route, so it is the reload that hands the
  // connection over to it. The session cookie survives, so the app comes back
  // signed in with only realtime broken.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Rooms' })).toBeVisible();

  await expect(banner(page)).toBeVisible({ timeout: 20_000 });
  // Sending still works while this is up; it is other people's messages that
  // stop arriving, which is exactly what the banner has to say.
  await expect(banner(page).getByText('Connection lost')).toBeVisible({ timeout: 20_000 });
  await expect(banner(page).getByText(/Trying again in \d+ seconds?\./)).toBeVisible();

  const before = attempts;
  // Auto-waits for the button to be enabled: it is disabled for the moment an
  // attempt is actually in flight, and only the wait can be skipped.
  await banner(page).getByRole('button', { name: 'Retry' }).click();

  // The click has to produce an attempt of its own rather than leave the
  // scheduled one to fire on time.
  await expect.poll(() => attempts, { timeout: 5_000 }).toBeGreaterThan(before);
});
