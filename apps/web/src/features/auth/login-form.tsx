import { GatewayError, type ServerDescriptor } from '@open-rocket-chat/client-sdk';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/button';
import { Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { LoginServices, NoSignInMethods } from './login-services';
import { describeLoginError, useLogin } from './use-session';

export interface LoginFormProps {
  /** Servers offered in the picker. Already filtered by the caller. */
  servers: readonly ServerDescriptor[];
  defaultServerId?: string;
  /**
   * Called once the session has been created or extended. Fires from the
   * mutation itself, so it still runs when signing in unmounts this form.
   */
  onSuccess?: () => void;
  className?: string;
}

/**
 * Credentials for one Rocket.Chat server.
 *
 * Shared by the sign-in screen and the "add a server" dialog: signing in to a
 * second server is the same exchange, and the gateway decides whether the
 * result starts a session or joins the existing one.
 */
export const LoginForm = ({ servers, defaultServerId, onSuccess, className }: LoginFormProps) => {
  const { t } = useTranslation('auth');
  const login = useLogin({ onSuccess });

  const [serverId, setServerId] = useState<string>();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const gatewayError = login.error instanceof GatewayError ? login.error : null;
  // Rocket.Chat accepts the password first and only then asks for a code, so
  // the field appears in response to the server rather than up front.
  const needsTotp = gatewayError?.needsTwoFactor ?? false;

  // The same sentence the toast shows; kept beside the button as well because
  // that is where somebody re-reading their password is already looking.
  const errorMessage = login.error ? describeLoginError(login.error) : null;

  // Only worth showing when there is a choice to make; a gateway fronting one
  // server should not make people pick it.
  const showServerPicker = servers.length > 1;
  const chosenServerId = serverId ?? defaultServerId ?? servers[0]?.id;
  const chosenServer = servers.find((server) => server.id === chosenServerId);

  // Which methods this server actually offers. An administrator who has moved
  // to SSO can turn the password form off, and a server that could not be
  // asked defaults to offering it — locking somebody out over an unanswered
  // request would be the worse failure.
  const passwordLoginEnabled = chosenServer?.passwordLoginEnabled ?? true;
  const loginServices = chosenServer?.loginServices ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();

    login.mutate({
      user,
      password,
      ...(needsTotp && totpCode ? { totpCode } : {}),
      ...(chosenServerId ? { serverId: chosenServerId } : {}),
    });
  };

  return (
    <form onSubmit={submit} className={className}>
      {showServerPicker ? (
        <div className="space-y-1.5">
          <label htmlFor="server" className="text-content-muted text-xs font-medium">
            {t('server.label')}
          </label>
          <select
            id="server"
            value={chosenServerId ?? ''}
            onChange={(event) => setServerId(event.target.value)}
            className="border-line bg-app text-content focus:border-focus h-10 w-full rounded-lg border px-3 text-sm focus:outline-none"
          >
            {servers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.version ? ` — ${option.version}` : ''}
              </option>
            ))}
          </select>
          <p className="text-content-muted text-xs">{t('server.hint')}</p>
        </div>
      ) : null}

      {passwordLoginEnabled ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="user" className="text-content-muted text-xs font-medium">
              {t('field.user')}
            </label>
            <Input
              id="user"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-content-muted text-xs font-medium">
              {t('field.password')}
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {needsTotp ? (
            <div className="space-y-1.5">
              <label htmlFor="totp" className="text-content-muted text-xs font-medium">
                {t('field.totp')}
              </label>
              <Input
                id="totp"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
          ) : null}

          {errorMessage && !needsTotp ? (
            <p role="alert" className="text-danger text-sm">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" disabled={login.isPending}>
            {login.isPending ? <Spinner className="size-4" /> : null}
            {needsTotp ? t('action.verify') : t('action.signIn')}
          </Button>
        </>
      ) : null}

      <LoginServices
        services={loginServices}
        {...(chosenServerId ? { serverId: chosenServerId } : {})}
        withSeparator={passwordLoginEnabled}
        {...(onSuccess ? { onSuccess } : {})}
      />

      {/* Nothing left to offer: an SSO-only server whose providers this
          browser cannot drive, or one that answered with neither. */}
      {!passwordLoginEnabled && loginServices.length === 0 ? <NoSignInMethods /> : null}
    </form>
  );
};
