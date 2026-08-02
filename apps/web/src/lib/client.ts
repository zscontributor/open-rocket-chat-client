import { OpenRocketChatClient } from '@open-rocket-chat/client-sdk';
import i18next from 'i18next';

/**
 * In development the Vite dev server proxies `/api` and `/ws`, so the gateway
 * is same-origin and the session cookie needs no cross-site configuration. A
 * production build points straight at the gateway.
 */
const gatewayOrigin = import.meta.env.PROD
  ? (import.meta.env.VITE_GATEWAY_URL ?? window.location.origin)
  : window.location.origin;

export const client = new OpenRocketChatClient({
  baseUrl: gatewayOrigin,
  // Read at request time so changing the language in Settings also changes
  // gateway-generated error messages without rebuilding the client instance.
  locale: () => i18next.resolvedLanguage ?? i18next.language,
  onUnauthenticated: () => {
    // Broadcast rather than redirect: routing belongs to React, and this module
    // is imported by non-component code too.
    window.dispatchEvent(new CustomEvent('orc:unauthenticated'));
  },
});
