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

/** Opens a channel rather than whichever room happens to be first: the bar
 *  offers Members and Mentions only outside a direct message. */
const openFirstChannel = async (page: Page): Promise<void> => {
  await page.getByRole('navigation', { name: 'Rooms' }).getByRole('button').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

const bar = (page: Page, name: string) => page.getByRole('complementary', { name });

/**
 * The room header's action buttons.
 *
 * Scoped to the header on purpose: the sidebar has its own "Threads" and
 * "Mentions" shortcuts, so an unscoped lookup finds the wrong one.
 */
const toolbox = (page: Page) => page.getByRole('banner');

test('opens each contextual bar tab from the room header', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  await toolbox(page).getByRole('button', { name: 'Room Info' }).click();
  await expect(bar(page, 'Room Info')).toBeVisible();

  // Pressing the same action again closes it, the way Rocket.Chat's toolbar does.
  await toolbox(page).getByRole('button', { name: 'Room Info' }).click();
  await expect(bar(page, 'Room Info')).toBeHidden();

  // Every panel Rocket.Chat keeps on the toolbar rather than in the overflow menu.
  for (const tab of ['Threads', 'Search Messages', 'Mentions', 'Files']) {
    await toolbox(page).getByRole('button', { name: tab, exact: true }).click();
    await expect(bar(page, tab)).toBeVisible();
  }

  // Escape dismisses the bar, like every other transient surface in the app.
  await page.keyboard.press('Escape');
  await expect(bar(page, 'Files')).toBeHidden();
});

test('floats the panel over the room on a phone instead of squeezing it', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  await page.setViewportSize({ width: 390, height: 844 });

  // The toolbox folds into the menu at this width: six 36px targets and a room
  // name do not both fit in a phone's header.
  await toolbox(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Room Info' }).click();

  const info = bar(page, 'Room Info');
  await expect(info).toBeVisible();

  const panel = await info.boundingBox();

  // The regression: the panel took its 280px minimum whatever the viewport,
  // leaving the conversation a sliver with no room name in its header and a
  // message box too narrow to type in. It now covers the room instead —
  // everything except the room list's own rail.
  expect(panel?.width ?? 0).toBeGreaterThan(300);
  expect(panel?.x ?? 0).toBeLessThan(80);

  // And gives the room back, rather than leaving it covered.
  await page.keyboard.press('Escape');
  await expect(info).toBeHidden();
});

test('loads the file list rather than hanging on it', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  await toolbox(page).getByRole('button', { name: 'Files', exact: true }).click();
  const files = bar(page, 'Files');
  await expect(files).toBeVisible();

  // The query has to *settle*. Rocket.Chat rejects an unexpected query
  // parameter on `channels.files` with a 400, and the panel then sat on
  // "Loading…" forever — which looks like slowness rather than a failure, so
  // asserting the panel is merely visible would have passed throughout.
  await expect(files.getByText('Loading…')).toBeHidden();

  // Either it lists files or it says there are none; both are settled states,
  // and which one depends on what the seeded room happens to hold. A row is
  // identified by its download link rather than its text, because the name is
  // truncated and the label lives on the link.
  await expect(
    files.getByText('Nothing has been uploaded here yet.').or(files.getByRole('link').first()),
  ).toBeVisible();

  // The type filter re-queries, so it exercises the parameters as well.
  await files.getByRole('button', { name: 'Images', exact: true }).click();
  await expect(files.getByText('Loading…')).toBeHidden();
});

test('drills from the member list into a profile and back', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  await toolbox(page).getByRole('button', { name: 'Members', exact: true }).click();

  const members = page.getByRole('complementary', { name: /^Members/ });
  await expect(members).toBeVisible();

  // The signed-in admin is a member of every seeded room, and is badged.
  const self = members.getByRole('button', { name: /admin/i }).first();
  await expect(self).toBeVisible();
  await self.click();

  await expect(bar(page, 'Profile')).toBeVisible();
  await expect(bar(page, 'Profile').getByText('@admin')).toBeVisible();

  // Back returns to the list rather than closing the bar.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('complementary', { name: /^Members/ })).toBeVisible();
});

test('filters the member list without losing the panel', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  await toolbox(page).getByRole('button', { name: 'Members', exact: true }).click();
  const members = page.getByRole('complementary', { name: /^Members/ });

  await members.getByRole('searchbox', { name: 'Search members' }).fill('zzz-nobody');
  await expect(members.getByText(/No members match/)).toBeVisible();

  await members.getByRole('searchbox', { name: 'Search members' }).fill('');
  await expect(members.getByRole('button', { name: /admin/i }).first()).toBeVisible();
});

test('renders emoji shortcodes after a reload restores the cache', async ({ page }) => {
  await signIn(page);
  await openFirstChannel(page);

  const composer = page.getByRole('textbox', { name: /^Message / });
  const marker = `emoji ${Date.now().toString(36)}`;
  await composer.fill(`${marker} :tada:`);
  await composer.press('Enter');
  await expect(page.getByText(marker)).toBeVisible();

  // The regression this guards: the shortcode index is a `Map`, and it used to
  // be written to IndexedDB by the cache persister. `JSON.stringify` turns a
  // `Map` into `{}`, so on the *second* visit every message body called `.get`
  // on an object that had none and the timeline threw. A first load never hits
  // it — only a reload with a warm cache does.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Rendered as the character, not left as the literal `:tada:`.
  await expect(page.getByText(marker)).toContainText('🎉');
  expect(errors, 'the restored cache must not break the timeline').toEqual([]);
});
