import type { LoginService } from '@open-rocket-chat/client-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canUseLoginService, OAuthError, requestOAuthCredential } from '../oauth';

const CREDENTIAL_STORAGE_PREFIX = 'Meteor.oauth.credentialSecret-';

const service = (overrides: Partial<LoginService> = {}): LoginService => ({
  id: 'google',
  title: 'Google',
  label: null,
  icon: 'google',
  buttonColor: null,
  buttonTextColor: null,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/auth?client_id=abc&response_type=code',
  redirectUrl: 'https://chat.example.com/_oauth/google',
  ...overrides,
});

/** A popup that reports itself open until something closes it. */
const stubPopup = () => {
  const popup = {
    closed: false,
    close: vi.fn(() => {
      popup.closed = true;
    }),
  };
  return popup;
};

const store = new Map<string, string>();

const setUpBrowser = (origin: string) => {
  const popup = stubPopup();
  const open = vi.fn((_url: string, _target?: string, _features?: string) => popup);

  vi.stubGlobal('window', {
    location: { origin },
    open,
    screenX: 0,
    screenY: 0,
    outerWidth: 1440,
    outerHeight: 900,
  });

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => void store.delete(key),
  });

  return { popup, open };
};

/** What Rocket.Chat's callback page does on its way out. */
const reportCredential = (credentialToken: string, secret: string) => {
  store.set(`${CREDENTIAL_STORAGE_PREFIX}${credentialToken}`, secret);
};

const tokenFromOpenedUrl = (url: string): string => {
  const state = new URL(url).searchParams.get('state') ?? '';
  return JSON.parse(atob(state)).credentialToken;
};

beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OAuth sign-in', () => {
  it('only offers a service whose result this origin is allowed to read', () => {
    setUpBrowser('https://chat.example.com');
    expect(canUseLoginService(service())).toBe(true);

    setUpBrowser('https://client.example.com');
    expect(canUseLoginService(service())).toBe(false);
  });

  it('sends Rocket.Chat the state its callback expects', async () => {
    const { open, popup } = setUpBrowser('https://chat.example.com');

    // Asserted before the clock moves: the rejection has nowhere to go
    // otherwise, and settling here keeps the attempt from outliving the test.
    const settled = expect(requestOAuthCredential(service())).rejects.toBeInstanceOf(OAuthError);
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(200);
    await settled;

    const url = new URL(open.mock.calls[0]![0]);
    // Everything the gateway built is preserved; only `state` is added.
    expect(url.searchParams.get('client_id')).toBe('abc');

    const state = JSON.parse(atob(url.searchParams.get('state')!));
    expect(state.loginStyle).toBe('popup');
    expect(state.isCordova).toBe(false);
    // Meteor rejects a credential token outside this alphabet.
    expect(state.credentialToken).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('resolves with the credential the callback left behind, and clears it', async () => {
    const { open, popup } = setUpBrowser('https://chat.example.com');

    const pending = requestOAuthCredential(service());
    const credentialToken = tokenFromOpenedUrl(open.mock.calls[0]![0]);

    reportCredential(credentialToken, 'secret-1');
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toEqual({ credentialToken, credentialSecret: 'secret-1' });
    // Single-use: a replay must not find it still sitting there.
    expect(store.size).toBe(0);
    expect(popup.close).toHaveBeenCalled();
  });

  it('reports a popup that closed without reporting anything as cancelled', async () => {
    const { popup } = setUpBrowser('https://chat.example.com');

    const settled = expect(requestOAuthCredential(service())).rejects.toMatchObject({ reason: 'cancelled' });
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(200);
    await settled;
  });

  it('gives up on a window nobody ever finished with', async () => {
    setUpBrowser('https://chat.example.com');

    const settled = expect(requestOAuthCredential(service())).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 200);
    await settled;
  });

  it('refuses to start when the browser could not read the result anyway', async () => {
    const { open } = setUpBrowser('https://client.example.com');

    await expect(requestOAuthCredential(service())).rejects.toBeInstanceOf(OAuthError);
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a blocked popup rather than waiting for one that never opened', async () => {
    setUpBrowser('https://chat.example.com');
    vi.stubGlobal('window', { ...window, open: () => null });

    await expect(requestOAuthCredential(service())).rejects.toMatchObject({ reason: 'blocked' });
  });
});
