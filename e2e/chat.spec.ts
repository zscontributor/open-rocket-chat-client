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

const openFirstRoom = async (page: Page): Promise<string> => {
  const room = page.getByRole('navigation', { name: 'Rooms' }).getByRole('button').first();
  const name = (await room.textContent())?.trim() ?? '';
  await room.click();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return name;
};

test('signs in and keeps the Rocket.Chat token out of the browser', async ({ page }) => {
  await signIn(page);

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === 'orc_session');

  expect(session, 'the gateway should set a session cookie').toBeDefined();
  expect(session?.httpOnly, 'the session cookie must not be readable from JavaScript').toBe(true);

  // The Rocket.Chat auth token lives server-side; nothing resembling it should
  // be reachable from the page.
  const exposed = await page.evaluate(() => ({
    cookie: document.cookie,
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));

  expect(exposed.cookie).not.toContain('orc_session');
  expect(exposed.local).not.toMatch(/authToken|X-Auth-Token/i);
  expect(exposed.session).not.toMatch(/authToken|X-Auth-Token/i);
});

test('names the server in the room URL', async ({ page }) => {
  await signIn(page);
  await openFirstRoom(page);

  // Room ids are unique only within one Rocket.Chat server, so a shareable
  // link has to say which server it means.
  await expect(page).toHaveURL(/\/servers\/default\/rooms\/[^/]+$/);

  // A link written before multi-server still opens, against the active server.
  const roomId = new URL(page.url()).pathname.split('/').pop() ?? '';
  await page.goto(`/rooms/${roomId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('lets the add-server dialog be closed again', async ({ page }) => {
  await signIn(page);

  const rail = page.getByRole('navigation', { name: 'Servers' });
  // The rail only exists where there is more than one server to choose from,
  // so a gateway fronting a single Rocket.Chat has nothing to test here.
  test.skip(!(await rail.isVisible()), 'gateway fronts a single server');

  await rail.getByRole('button', { name: 'Add a server' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Signing in to the last available server empties the form, and without this
  // button the dialog had no control left to dismiss it with.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('sends a message and shows it in the timeline', async ({ page }) => {
  await signIn(page);
  await openFirstRoom(page);

  const text = `playwright ${Date.now()}`;
  const composer = page.getByRole('combobox', { name: /^Message / });
  await composer.fill(text);
  await composer.press('Enter');

  await expect(page.getByText(text)).toBeVisible();
  // Sent text must not linger in the composer.
  await expect(composer).toHaveValue('');
});

test('delivers a message from another session over the realtime channel', async ({ page, browser }) => {
  await signIn(page);
  const roomName = await openFirstRoom(page);

  // A second, independent browser context: this proves the event travelled
  // through Rocket.Chat and the gateway rather than being echoed locally.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();

  await signIn(otherPage);
  await otherPage
    .getByRole('navigation', { name: 'Rooms' })
    .getByRole('button', { name: new RegExp(roomName) })
    .first()
    .click();

  const text = `from the other tab ${Date.now()}`;
  const composer = otherPage.getByRole('combobox', { name: /^Message / });
  await composer.fill(text);
  await composer.press('Enter');

  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });

  await otherContext.close();
});

test('reports a live realtime connection', async ({ page }) => {
  await signIn(page);

  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 });
});

test('switches colour scheme and theme from settings', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme)).toBe('dark');

  // Tokens are CSS custom properties, so a theme swap must change the computed
  // value rather than a class name.
  const darkAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--orc-accent-base').trim(),
  );

  await page.getByRole('button', { name: /Nord Slate/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--orc-accent-base').trim()),
    )
    .not.toBe(darkAccent);

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('nord-slate');

  await page.getByRole('button', { name: 'Light' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme)).toBe('light');
});

test('previews an attached image in the lightbox before sending', async ({ page }) => {
  await signIn(page);
  await openFirstRoom(page);

  // A 1x1 PNG is enough to exercise the object-URL preview path.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      { name: 'shot-one.png', mimeType: 'image/png', buffer: png },
      { name: 'shot-two.png', mimeType: 'image/png', buffer: png },
    ]);

  await expect(page.getByText('2 attachments')).toBeVisible();

  await page.getByRole('button', { name: 'Preview shot-one.png' }).click();

  const viewer = page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('1 of 2')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Close viewer' }).click();
  await expect(viewer).toBeHidden();

  // Staged files must be removable without sending them.
  await page.getByRole('button', { name: 'Remove shot-one.png' }).click();
  await expect(page.getByText('1 attachment')).toBeVisible();
});

test('hands the composer back when every uploading file is removed', async ({ page }) => {
  await signIn(page);
  await openFirstRoom(page);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  // Uploads of a 1x1 PNG finish instantly, so the request is held open to keep
  // the tray in the uploading state long enough to remove the files from it.
  await page.route('**/rooms/*/files', async () => {
    await new Promise(() => {});
  });

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      { name: 'held-one.png', mimeType: 'image/png', buffer: png },
      { name: 'held-two.png', mimeType: 'image/png', buffer: png },
    ]);

  await page.getByRole('combobox', { name: /^Message / }).fill('with a caption');

  const sendButton = page.getByRole('button', { name: 'Send message' });
  await sendButton.click();
  await expect(sendButton).toBeDisabled();

  await page.getByRole('button', { name: 'Remove all' }).click();

  // The in-flight upload is aborted rather than left to finish, so the box
  // comes back with the typed text still in it.
  await expect(sendButton).toBeEnabled();
  await expect(page.getByText('2 attachments')).toBeHidden();
  await expect(page.getByRole('combobox', { name: /^Message / })).toHaveValue('with a caption');
});

test('offers per-room actions from the sidebar', async ({ page }) => {
  await signIn(page);

  const rooms = page.getByRole('navigation', { name: 'Rooms' });
  const room = rooms.getByRole('button').first();
  const name = (await room.textContent())?.trim() ?? '';

  await room.hover();
  await page.getByRole('button', { name: `Room actions for ${name}` }).click();

  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Mark (Unread|Read)/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Hide' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Leave' })).toBeVisible();

  // Favouriting through the menu must move the room into the Favorites group.
  const favouriteItem = menu.getByRole('menuitem', { name: /^(Favorite|Unfavorite)$/ });
  const wasFavourite = (await favouriteItem.textContent())?.trim() === 'Unfavorite';
  await favouriteItem.click();

  await room.hover();
  await page.getByRole('button', { name: `Room actions for ${name}` }).click();
  await expect(page.getByRole('menuitem', { name: wasFavourite ? 'Favorite' : 'Unfavorite' })).toBeVisible();

  // Put it back so the suite can be run repeatedly.
  await page.getByRole('menuitem', { name: wasFavourite ? 'Favorite' : 'Unfavorite' }).click();
});

test('creates a channel from the drawer', async ({ page }) => {
  await signIn(page);

  // `exact` matters: a gateway fronting several servers shows the server rail,
  // whose "Add a server" button comes first in the DOM and would otherwise be
  // matched by a substring search for "Add".
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();

  const drawer = page.getByRole('dialog', { name: 'Create a room' });
  await expect(drawer).toBeVisible();

  const name = `drawer-${Date.now().toString(36)}`;
  await drawer.getByRole('button', { name: /Private Channel/ }).click();
  await drawer.getByLabel('Name').fill(name);
  await drawer.getByLabel('Topic').fill('made by playwright');
  // Submitted from the keyboard: it exercises the form rather than the button,
  // and does not depend on the drawer's layout having settled.
  await drawer.getByLabel('Topic').press('Enter');

  await expect(drawer).toBeHidden();

  // `.first()` because the row's own actions button is labelled with the room
  // name too, so the pattern matches both.
  const created = page
    .getByRole('navigation', { name: 'Rooms' })
    .getByRole('button', { name: new RegExp(name) })
    .first();
  await expect(created).toBeVisible();

  // The topic set at creation needs a second upstream call; check it landed.
  await created.click();
  await expect(page.getByText('made by playwright')).toBeVisible();
});

test('inserts an emoji into the composer from the picker', async ({ page }) => {
  await signIn(page);
  await openFirstRoom(page);

  const composer = page.getByRole('combobox', { name: /^Message / });
  await composer.fill('ship it ');

  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search emoji' }).fill('rocket');

  // The custom section is server-provided and may be empty; the standard set
  // always has this one.
  await page.getByRole('button', { name: 'rocket', exact: true }).first().click();

  await expect(composer).toHaveValue(/ship it :rocket: $/);
});
