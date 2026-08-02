import type { LoginService } from '@open-rocket-chat/client-sdk';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { canUseLoginService } from './oauth';
import { OAuthHelpDialog } from './oauth-help-dialog';
import { describeLoginError, useOAuthLogin } from './use-session';

/**
 * Providers with a mark of their own. Rocket.Chat keeps the same table on its
 * own login screen: the icon never comes from the server, because the service
 * record holds nothing but a client id.
 */
const PROVIDER_ICONS = {
  apple: Icons.providerApple,
  facebook: Icons.providerFacebook,
  github: Icons.providerGithub,
  gitlab: Icons.providerGitlab,
  google: Icons.providerGoogle,
  linkedin: Icons.providerLinkedin,
} as const;

const iconFor = (service: LoginService) => PROVIDER_ICONS[service.icon as keyof typeof PROVIDER_ICONS] ?? Icons.signIn;

export interface LoginServicesProps {
  /** Providers the chosen server has enabled, in the order to show them. */
  services: readonly LoginService[];
  serverId?: string;
  /** Whether a password form sits above, and so whether a separator is needed. */
  withSeparator?: boolean;
  onSuccess?: () => void;
}

/**
 * The OAuth half of a sign-in.
 *
 * Which providers appear is the server's decision, not this client's: the
 * gateway reports what Rocket.Chat has enabled, and anything a browser cannot
 * actually complete never reaches here. What it cannot rule out is the one
 * case only the browser knows about — a Rocket.Chat served from a different
 * origin, whose sign-in result this page would not be allowed to read — so
 * those buttons are shown, disabled, with the reason stated rather than
 * failing at the last step.
 */
export const LoginServices = ({ services, serverId, withSeparator, onSuccess }: LoginServicesProps) => {
  const { t } = useTranslation('auth');
  const oauth = useOAuthLogin({ onSuccess });
  const [helpOpen, setHelpOpen] = useState(false);

  if (services.length === 0) return null;

  const pendingId = oauth.isPending ? oauth.variables?.service.id : undefined;
  // Every service on a server shares its origin, so the first unusable one is
  // as good as any for explaining which address is the problem.
  const unsupported = services.find((service) => !canUseLoginService(service));
  const errorMessage = oauth.error ? describeLoginError(oauth.error) : null;

  return (
    <div className="space-y-3">
      {/* Below the password form, the way Rocket.Chat's own login screen
          orders them: the credentials somebody already has come first. */}
      {withSeparator ? (
        <div className="flex items-center gap-3" aria-hidden>
          <span className="bg-line h-px flex-1" />
          <span className="text-content-muted text-xs">{t('oauth.or')}</span>
          <span className="bg-line h-px flex-1" />
        </div>
      ) : null}

      <div className="space-y-2">
        {services.map((service) => {
          const Icon = iconFor(service);
          const usable = canUseLoginService(service);

          return (
            <Button
              key={service.id}
              variant="outline"
              className="w-full"
              // An administrator's colours win over the app's own theme: they
              // are usually the provider's brand, and this is the same button
              // Rocket.Chat would paint with them.
              style={
                service.buttonColor
                  ? { backgroundColor: service.buttonColor, color: service.buttonTextColor ?? undefined }
                  : undefined
              }
              disabled={!usable || oauth.isPending}
              onClick={() => oauth.mutate({ service, ...(serverId ? { serverId } : {}) })}
            >
              {pendingId === service.id ? <Spinner className="size-4" /> : <Icon size={18} />}
              {service.label ?? t('action.signInWith', { provider: service.title })}
            </Button>
          );
        })}
      </div>

      {unsupported ? (
        <p className="text-content-muted text-xs leading-relaxed">
          {t('oauth.crossOrigin')}{' '}
          <button type="button" onClick={() => setHelpOpen(true)} className="text-accent underline underline-offset-2">
            {t('oauth.crossOriginHelp')}
          </button>
        </p>
      ) : null}

      {unsupported ? (
        <OAuthHelpDialog open={helpOpen} onOpenChange={setHelpOpen} redirectUrl={unsupported.redirectUrl} />
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-danger text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

/** Shown in place of the password form when a server has turned it off. */
export const NoSignInMethods = ({ className }: { className?: string }) => {
  const { t } = useTranslation('auth');

  return <p className={cn('text-content-muted text-sm', className)}>{t('oauth.noMethods')}</p>;
};
