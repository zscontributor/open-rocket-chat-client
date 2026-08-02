import type { LoginService } from '@open-rocket-chat/client-sdk';

/**
 * Where Rocket.Chat's OAuth callback leaves the credential secret.
 *
 * Its popup hands the secret to `window.opener.Package.oauth` when the opener
 * is a Meteor client, and falls back to `localStorage` when it is not — which
 * is every client but Rocket.Chat's own. The key is Meteor's, not ours; it has
 * to match `OAuth._storageTokenPrefix` exactly.
 */
const CREDENTIAL_STORAGE_PREFIX = 'Meteor.oauth.credentialSecret-';

const POLL_INTERVAL_MS = 100;

/** Long enough for a password manager, a second factor and a consent screen. */
const TIMEOUT_MS = 5 * 60_000;

const POPUP_WIDTH = 650;
const POPUP_HEIGHT = 640;

/** Meteor's `Random.secret()` alphabet; the server rejects anything else. */
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TOKEN_LENGTH = 43;

export type OAuthFailure =
  | 'blocked'
  | 'cancelled'
  | 'timeout'
  /** The Rocket.Chat server is on another origin, so its result is unreadable. */
  | 'unsupported';

export class OAuthError extends Error {
  constructor(readonly reason: OAuthFailure) {
    super(`OAuth sign-in failed: ${reason}`);
    this.name = 'OAuthError';
  }
}

export interface OAuthCredential {
  credentialToken: string;
  credentialSecret: string;
}

/**
 * Whether this browser can finish the handshake for a service.
 *
 * Rocket.Chat's callback page reports its result into the storage of its own
 * origin. A client served from somewhere else can start the flow and watch the
 * user complete it, then find nothing it is allowed to read — so the honest
 * thing is to say so up front rather than fail at the last step.
 */
export const canUseLoginService = (service: LoginService): boolean => {
  try {
    return new URL(service.redirectUrl).origin === window.location.origin;
  } catch {
    return false;
  }
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  return Array.from(bytes, (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join('');
};

/**
 * The `state` Rocket.Chat expects back from the provider: base64 JSON, because
 * not every provider round-trips the parameter URL-encoded.
 *
 * `isCordova` stays false so the callback page closes itself; a Cordova-style
 * flow leaves the popup sitting on a blank page instead.
 */
const encodeState = (credentialToken: string): string =>
  btoa(JSON.stringify({ loginStyle: 'popup', credentialToken, isCordova: false }));

const takeCredentialSecret = (credentialToken: string): string | null => {
  const key = `${CREDENTIAL_STORAGE_PREFIX}${credentialToken}`;
  try {
    const secret = localStorage.getItem(key);
    // Single-use: leaving it behind would let a stale value satisfy a later
    // attempt that was actually refused.
    if (secret) localStorage.removeItem(key);
    return secret;
  } catch {
    return null;
  }
};

const popupFeatures = (): string => {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes`;
};

/**
 * Runs the provider handshake in a popup and returns what Rocket.Chat parked
 * for it.
 *
 * The gateway is deliberately not part of this: Rocket.Chat holds the client
 * secret, so the exchange is between the browser and Rocket.Chat, and only the
 * resulting credential pair — useless without the server's own record of the
 * attempt — travels on to the gateway.
 */
export const requestOAuthCredential = (service: LoginService): Promise<OAuthCredential> => {
  if (!canUseLoginService(service)) return Promise.reject(new OAuthError('unsupported'));

  const credentialToken = randomToken();
  const url = new URL(service.authorizeUrl);
  url.searchParams.set('state', encodeState(credentialToken));

  const popup = window.open(url.toString(), 'orc-oauth', popupFeatures());
  if (!popup) return Promise.reject(new OAuthError('blocked'));

  return new Promise<OAuthCredential>((resolve, reject) => {
    const startedAt = Date.now();

    const finish = (outcome: OAuthCredential | OAuthError) => {
      clearInterval(timer);
      if (outcome instanceof OAuthError) reject(outcome);
      else resolve(outcome);
    };

    const timer = setInterval(() => {
      // Checked before `closed`, because a callback page that cannot close
      // itself has still done its job.
      const credentialSecret = takeCredentialSecret(credentialToken);
      if (credentialSecret) {
        popup.close();
        finish({ credentialToken, credentialSecret });
        return;
      }

      // Closed with nothing written means the user backed out — or the
      // provider refused, which Rocket.Chat reports the same way.
      if (popup.closed) {
        finish(new OAuthError('cancelled'));
        return;
      }

      if (Date.now() - startedAt > TIMEOUT_MS) {
        popup.close();
        finish(new OAuthError('timeout'));
      }
    }, POLL_INTERVAL_MS);
  });
};
