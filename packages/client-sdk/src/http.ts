import { API_BASE_PATH, SERVER_ID_HEADER } from '@open-rocket-chat/api-contract';

import { GatewayError, NetworkError } from './errors.js';

/** How much of a request body has reached the gateway. */
export interface UploadProgress {
  loaded: number;
  /** Zero when the browser cannot say — a body of unknown length. */
  total: number;
}

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /**
   * Called as the body goes up. Only meaningful alongside `formData`, and only
   * in a browser: `fetch` reports nothing until the response begins, so a call
   * asking for progress is sent through `XMLHttpRequest` instead. Everywhere
   * else the request still runs, silently.
   */
  onUploadProgress?: (progress: UploadProgress) => void;
}

export interface TransportOptions {
  /** Origin of the gateway, e.g. `https://chat-gateway.example.com`. */
  baseUrl: string;
  /**
   * Which of the session's Rocket.Chat servers calls act on.
   *
   * Left unset, the gateway uses the session's default server — the only
   * behaviour a single-server deployment ever needs.
   */
  serverId?: string;
  fetch?: typeof globalThis.fetch;
  /**
   * UI locale sent to the gateway through `Accept-Language`.
   * A getter keeps long-lived clients in sync when the user changes language.
   */
  locale?: string | (() => string | undefined);
  /** Invoked whenever a call fails with `unauthorized`, so the app can log out once. */
  onUnauthenticated?: () => void;
}

export class HttpTransport {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(private readonly options: TransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get origin(): string {
    return this.baseUrl;
  }

  get serverId(): string | undefined {
    return this.options.serverId;
  }

  /** Absolute URL for a gateway-relative media path returned inside a message. */
  resolveUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async request<T>(path: string, options: HttpOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${API_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      // Repeat the parameter for arrays; the contract parses either form.
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(key, entry);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.options.serverId) headers[SERVER_ID_HEADER] = this.options.serverId;
    const locale = typeof this.options.locale === 'function' ? this.options.locale() : this.options.locale;
    if (locale) headers['accept-language'] = locale;
    let body: BodyInit | undefined;

    if (options.formData) {
      body = options.formData;
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const method = options.method ?? 'GET';

    const { status, text } = this.reportsProgress(options)
      ? await sendWithProgress(url, method, headers, options.formData, options)
      : await this.send(url, method, headers, body, options.signal);

    const payload: unknown = text ? safeParse(text) : undefined;

    if (status < 200 || status >= 300) {
      const error = GatewayError.fromResponse(status, payload);
      if (error.isUnauthenticated) this.options.onUnauthenticated?.();
      throw error;
    }

    return payload as T;
  }

  /**
   * Whether this call has to go through `XMLHttpRequest` to be watchable.
   * A caller that asked for progress in a runtime without XHR — tests, or
   * anything server-side — gets the request rather than an error.
   */
  private reportsProgress(options: HttpOptions): options is HttpOptions & { formData: FormData } {
    return Boolean(options.onUploadProgress && options.formData) && typeof XMLHttpRequest !== 'undefined';
  }

  private async send(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{ status: number; text: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal,
        // The session lives in an HttpOnly cookie, so it only travels if
        // credentials are sent — including cross-origin.
        credentials: 'include',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new NetworkError('Cannot reach the gateway', error);
    }

    // 204 has no body to read; `text()` answers with the empty string either
    // way, which `safeParse` is never asked about.
    return { status: response.status, text: response.status === 204 ? '' : await response.text() };
  }
}

/**
 * The same request, sent so the bytes can be counted on their way out.
 *
 * `fetch` has no equivalent: its request body is opaque until the response
 * starts arriving, so a 60 MB upload is indistinguishable from a hung one for
 * as long as it takes. `XMLHttpRequest.upload` is the only thing in a browser
 * that reports it, which is the whole reason this path exists — everything
 * else here exists to make it behave exactly like the `fetch` one.
 */
const sendWithProgress = (
  url: URL,
  method: string,
  headers: Record<string, string>,
  formData: FormData,
  options: HttpOptions,
): Promise<{ status: number; text: string }> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url.toString(), true);
    // The `fetch` path's `credentials: 'include'`.
    request.withCredentials = true;

    // `content-type` is deliberately never among these: the browser has to
    // write it itself, multipart boundary included.
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);

    const signal = options.signal;
    const onAbort = () => request.abort();

    const settle = (finish: () => void) => {
      signal?.removeEventListener('abort', onAbort);
      finish();
    };

    request.upload.addEventListener('progress', (event) => {
      options.onUploadProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
    });

    request.addEventListener('load', () => {
      settle(() => resolve({ status: request.status, text: request.responseText }));
    });

    // Indistinguishable from `fetch` rejecting: no status, no body, no way to
    // tell offline from DNS from a CORS refusal.
    request.addEventListener('error', () => {
      settle(() => reject(new NetworkError('Cannot reach the gateway')));
    });

    request.addEventListener('timeout', () => {
      settle(() => reject(new NetworkError('The gateway took too long to respond')));
    });

    request.addEventListener('abort', () => {
      // The shape `fetch` throws when its signal fires, so callers that already
      // check for it keep working.
      settle(() => reject(new DOMException('The request was aborted', 'AbortError')));
    });

    if (signal?.aborted) {
      reject(new DOMException('The request was aborted', 'AbortError'));
      return;
    }

    signal?.addEventListener('abort', onAbort);
    request.send(formData);
  });

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
