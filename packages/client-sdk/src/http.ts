import { API_BASE_PATH, SERVER_ID_HEADER } from '@open-rocket-chat/api-contract';

import { GatewayError, NetworkError } from './errors.js';

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
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

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: options.signal,
        // The session lives in an HttpOnly cookie, so it only travels if
        // credentials are sent — including cross-origin.
        credentials: 'include',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new NetworkError('Cannot reach the gateway', error);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload: unknown = text ? safeParse(text) : undefined;

    if (!response.ok) {
      const error = GatewayError.fromResponse(response.status, payload);
      if (error.isUnauthenticated) this.options.onUnauthenticated?.();
      throw error;
    }

    return payload as T;
  }
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
