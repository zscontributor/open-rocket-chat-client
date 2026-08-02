import { afterEach, describe, expect, it, vi } from 'vitest';

import { GatewayError } from '../errors.js';
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

/**
 * Stands in for the browser API. `fetch` cannot report a request body's
 * progress at all, so the transport reaches for `XMLHttpRequest` when a caller
 * asks — and this is what proves the two paths behave alike.
 */
class FakeXhr extends EventTarget {
  static instances: FakeXhr[] = [];

  readonly upload = new EventTarget();

  readonly headers: Record<string, string> = {};

  status = 0;

  responseText = '';

  withCredentials = false;

  method = '';

  url = '';

  sent: FormData | undefined;

  aborted = false;

  constructor() {
    super();
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: FormData): void {
    this.sent = body;
  }

  abort(): void {
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
  }

  emitProgress(loaded: number, total: number): void {
    this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded, total, lengthComputable: true }));
  }

  respond(status: number, text: string): void {
    this.status = status;
    this.responseText = text;
    this.dispatchEvent(new Event('load'));
  }
}

const useFakeXhr = () => {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);

  return () => {
    const instance = FakeXhr.instances.at(-1);
    if (!instance) throw new Error('no XMLHttpRequest was opened');
    return instance;
  };
};

const upload = () => {
  const form = new FormData();
  form.set('file', new Blob(['bytes']), 'note.txt');
  return form;
};

describe('HttpTransport upload progress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports bytes leaving the browser and resolves the parsed body', async () => {
    const latest = useFakeXhr();
    const seen: { loaded: number; total: number }[] = [];

    const transport = new HttpTransport({ baseUrl: 'https://gateway.test', serverId: 'acme' });
    const pending = transport.request('/rooms/r1/files', {
      method: 'POST',
      formData: upload(),
      onUploadProgress: (progress) => seen.push(progress),
    });

    const request = latest();
    request.emitProgress(512, 2048);
    request.emitProgress(2048, 2048);
    request.respond(201, JSON.stringify({ id: 'm1' }));

    await expect(pending).resolves.toEqual({ id: 'm1' });
    expect(seen).toEqual([
      { loaded: 512, total: 2048 },
      { loaded: 2048, total: 2048 },
    ]);

    // Everything the `fetch` path does for a session has to happen here too:
    // the cookie is HttpOnly, so an upload sent without credentials is simply
    // unauthenticated.
    expect(request.withCredentials).toBe(true);
    expect(request.headers['x-server-id']).toBe('acme');
    // Setting it by hand would strip the multipart boundary off the body.
    expect(request.headers['content-type']).toBeUndefined();
    expect(request.url).toBe('https://gateway.test/api/v1/rooms/r1/files');
  });

  it('raises a gateway error for a refused upload, exactly as fetch would', async () => {
    const latest = useFakeXhr();
    const onUnauthenticated = vi.fn();

    const transport = new HttpTransport({ baseUrl: 'https://gateway.test', onUnauthenticated });
    const pending = transport.request('/rooms/r1/files', {
      method: 'POST',
      formData: upload(),
      onUploadProgress: () => undefined,
    });

    latest().respond(401, JSON.stringify({ error: { code: 'unauthorized', message: 'Session expired' } }));

    await expect(pending).rejects.toBeInstanceOf(GatewayError);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('aborts in flight when the caller takes the file back', async () => {
    const latest = useFakeXhr();
    const controller = new AbortController();

    const transport = new HttpTransport({ baseUrl: 'https://gateway.test' });
    const pending = transport.request('/rooms/r1/files', {
      method: 'POST',
      formData: upload(),
      signal: controller.signal,
      onUploadProgress: () => undefined,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(latest().aborted).toBe(true);
  });

  it('still sends the request where XMLHttpRequest does not exist', async () => {
    // Server-side rendering, tests, anything outside a browser: asking for
    // progress must not be the difference between an upload and an error.
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'm1' })));
    const transport = new HttpTransport({ baseUrl: 'https://gateway.test', fetch });

    await expect(
      transport.request('/rooms/r1/files', {
        method: 'POST',
        formData: upload(),
        onUploadProgress: () => undefined,
      }),
    ).resolves.toEqual({ id: 'm1' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
