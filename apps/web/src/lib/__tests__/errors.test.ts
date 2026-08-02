import { GatewayError, NetworkError } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import { describeError, type ErrorMessageKey } from '../errors';

/** Returns the key itself, so a test asserts which message was chosen. */
const echo = (key: ErrorMessageKey): string => key;

const gatewayError = (
  code: ConstructorParameters<typeof GatewayError>[0],
  options: { upstream?: string; details?: Record<string, unknown>; message?: string } = {},
) => new GatewayError(code, options.message ?? 'developer-facing prose', 403, options.upstream, options.details);

describe('describeError', () => {
  it('names the connection when the gateway could not be reached', () => {
    expect(describeError(new NetworkError('offline'), echo)).toBe('error.network');
  });

  it('falls back for anything that is not a gateway failure', () => {
    expect(describeError(new Error('boom'), echo)).toBe('error.unknown');
    expect(describeError(undefined, echo)).toBe('error.unknown');
  });

  it('translates the gateway code rather than repeating its English message', () => {
    expect(describeError(gatewayError('forbidden'), echo)).toBe('error.code.forbidden');
    expect(describeError(gatewayError('rate_limited'), echo)).toBe('error.code.rate_limited');
  });

  /**
   * The case that prompted all of this: Rocket.Chat with direct messages
   * switched off answers `forbidden` / `error-not-allowed`, and "you lack
   * permission" would send the user to ask for a role that would not help.
   */
  it('prefers the upstream identifier when Rocket.Chat was more specific', () => {
    expect(describeError(gatewayError('forbidden', { upstream: 'error-not-allowed' }), echo)).toBe(
      'error.upstream.notAllowed',
    );
    expect(describeError(gatewayError('conflict', { upstream: 'error-duplicate-channel-name' }), echo)).toBe(
      'error.upstream.duplicateName',
    );
    // Favouriting a room the server no longer has a subscription for: only
    // `bad_request` survives the gateway, and that says nothing to act on.
    expect(describeError(gatewayError('bad_request', { upstream: 'error-invalid-subscription' }), echo)).toBe(
      'error.upstream.notSubscribed',
    );
    // Leaving a room as its only owner: `bad_request` again, and the way out —
    // hand ownership over first — is nowhere in it.
    expect(describeError(gatewayError('bad_request', { upstream: 'error-you-are-last-owner' }), echo)).toBe(
      'error.upstream.lastOwner',
    );
    // Several identifiers share one sentence, because the user's way out of
    // them is the same whichever hook refused the call.
    expect(describeError(gatewayError('bad_request', { upstream: 'error-app-prevented-deleting' }), echo)).toBe(
      'error.upstream.appPrevented',
    );
    // Archived rooms answer with the room's name interpolated into English
    // prose; the state is the part the user can act on.
    expect(describeError(gatewayError('bad_request', { upstream: 'error-room-archived' }), echo)).toBe(
      'error.upstream.roomArchived',
    );
  });

  /**
   * `canSendMessage` and friends throw a plain `Error`, so Rocket.Chat's REST
   * layer finds no identifier to put in `errorType` and the whole meaning
   * arrives as the message — either one of its own translation keys or an
   * English sentence. Muted, read-only and archived are the everyday reasons a
   * message will not send, so they are worth matching on.
   */
  it('translates the failures Rocket.Chat sends with no identifier at all', () => {
    expect(describeError(gatewayError('bad_request', { message: 'You_have_been_muted' }), echo)).toBe(
      'error.upstream.muted',
    );
    expect(
      describeError(
        gatewayError('bad_request', { message: "You can't send messages because the room is readonly." }),
        echo,
      ),
    ).toBe('error.upstream.readOnly');
    // The same throws put a bare identifier where prose would normally go.
    expect(describeError(gatewayError('bad_request', { message: 'error-invalid-room' }), echo)).toBe(
      'error.upstream.roomGone',
    );
  });

  /**
   * Rocket.Chat has far more identifiers than this client translates, and its
   * own sentence names the blocker where the derived `code` cannot.
   */
  it("repeats Rocket.Chat's sentence for an identifier it cannot translate", () => {
    const error = gatewayError('bad_request', {
      upstream: 'error-not-in-the-room',
      message: 'You are not in this room. [error-not-in-the-room]',
    });

    expect(describeError(error, echo)).toBe('You are not in this room.');
  });

  it('falls back to the code when the upstream message is only an identifier again', () => {
    const error = gatewayError('bad_request', { upstream: 'error-something-new', message: 'error-something-new' });

    expect(describeError(error, echo)).toBe('error.code.bad_request');
  });

  /**
   * `bad_request` is the only code the gateway forwards Rocket.Chat's text for.
   * For every other one it substitutes wording of its own — English prose that
   * says no more than the translated `code` line it would replace.
   */
  it('ignores the wording the gateway writes for itself', () => {
    const error = gatewayError('forbidden', {
      upstream: 'error-something-new',
      message: 'You do not have permission to perform this action',
    });

    expect(describeError(error, echo)).toBe('error.code.forbidden');
    expect(describeError(gatewayError('forbidden'), echo)).toBe('error.code.forbidden');
  });

  it('surfaces validation issues, which name the field the user must fix', () => {
    const error = gatewayError('bad_request', {
      details: { issues: [{ message: 'name: must not be empty' }, { message: 'topic: too long' }] },
    });

    expect(describeError(error, echo)).toBe('name: must not be empty topic: too long');
  });

  it('falls back to the code when the issue list carries no usable text', () => {
    const error = gatewayError('bad_request', { details: { issues: [{ path: ['name'] }] } });

    expect(describeError(error, echo)).toBe('error.code.bad_request');
  });
});
