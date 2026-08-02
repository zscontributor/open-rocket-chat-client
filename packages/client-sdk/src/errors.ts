import type { ApiError, ErrorCode } from '@open-rocket-chat/api-contract';

/**
 * Every failed gateway call surfaces as one of these. The gateway guarantees a
 * stable `code`, so UI logic should branch on that and never on the message,
 * which is prose and will change.
 */
export class GatewayError extends Error {
  override readonly name = 'GatewayError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly upstream?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }

  static fromResponse(status: number, body: unknown): GatewayError {
    const parsed = body as ApiError | undefined;

    if (parsed?.error?.code) {
      return new GatewayError(
        parsed.error.code,
        parsed.error.message,
        status,
        parsed.error.upstream,
        parsed.error.details as Record<string, unknown> | undefined,
      );
    }

    return new GatewayError('internal_error', `Request failed with HTTP ${status}`, status);
  }

  /** The session is gone or was never established; the app should show the login screen. */
  get isUnauthenticated(): boolean {
    return this.code === 'unauthorized';
  }

  get needsTwoFactor(): boolean {
    return this.code === 'totp_required';
  }
}

/** The gateway itself could not be reached — offline, DNS, or CORS. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
