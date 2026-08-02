import { describe, expect, it, vi } from 'vitest';

import { HttpTransport } from '../http.js';

describe('HttpTransport locale', () => {
  it('sends the current locale as Accept-Language on every request', async () => {
    let locale = 'en';
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const transport = new HttpTransport({
      baseUrl: 'https://gateway.test',
      fetch,
      locale: () => locale,
    });

    await transport.request('/health');
    locale = 'ja';
    await transport.request('/health');

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('accept-language')).toBe('en');
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('accept-language')).toBe('ja');
  });

  it('omits Accept-Language when no locale is configured', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}'));
    const transport = new HttpTransport({ baseUrl: 'https://gateway.test', fetch });

    await transport.request('/health');

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('accept-language')).toBe(false);
  });
});
