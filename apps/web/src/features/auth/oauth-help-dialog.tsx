import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';

/**
 * A reverse proxy that puts all three behind the Rocket.Chat hostname.
 *
 * Deliberately not translated: it is configuration to copy, and every line of
 * it is a literal an administrator will paste. The placeholders are the only
 * things meant to be edited.
 */
const PROXY_EXAMPLE = `server {
  server_name chat.example.com;

  # This client
  location /app/ { proxy_pass http://open-rocket-chat-client/; }

  # The gateway
  location /gw/  { proxy_pass http://gateway:4000/; }

  location /ws {
    proxy_pass http://gateway:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # Rocket.Chat itself
  location / { proxy_pass http://rocketchat:3000; }
}`;

const BUILD_EXAMPLE = 'VITE_GATEWAY_URL=https://chat.example.com/gw';

const Snippet = ({ children }: { children: string }) => (
  <pre className="bg-sunken border-line overflow-x-auto rounded-lg border p-3 text-xs leading-relaxed">
    <code>{children}</code>
  </pre>
);

const Address = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-content-muted shrink-0 text-xs">{label}</span>
    <code className="truncate text-xs" title={value}>
      {value}
    </code>
  </div>
);

export interface OAuthHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rocket.Chat's OAuth callback, which is what the address comparison is about. */
  redirectUrl: string;
}

/**
 * Why the single sign-on buttons are dead, and what to change so they are not.
 *
 * The constraint is the browser's, not Rocket.Chat's — the callback leaves its
 * result in the storage of its own origin — so there is no setting to point
 * somebody at, only a deployment to rearrange. That is worth several
 * paragraphs and a config sample rather than a line of small print.
 */
export const OAuthHelpDialog = ({ open, onOpenChange, redirectUrl }: OAuthHelpDialogProps) => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  const serverOrigin = safeOrigin(redirectUrl);
  const appOrigin = window.location.origin;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-base font-semibold">{t('oauth.help.title')}</Dialog.Title>
            <Dialog.Close
              aria-label={tCommon('action.close')}
              className="text-content-muted hover:bg-sunken hover:text-content -mt-1 -mr-1 rounded-md p-1 transition-colors"
            >
              <Icons.close size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-content-muted mt-3 text-sm leading-relaxed">
            {t('oauth.help.reason', { server: serverOrigin })}
          </Dialog.Description>

          <div className="border-line mt-4 space-y-1.5 rounded-lg border p-3">
            <Address label={t('oauth.help.appOrigin')} value={appOrigin} />
            <Address label={t('oauth.help.serverOrigin')} value={serverOrigin} />
          </div>

          <h3 className="mt-6 text-sm font-semibold">{t('oauth.help.fixTitle')}</h3>
          <p className="text-content-muted mt-2 text-sm leading-relaxed">{t('oauth.help.fixIntro')}</p>
          <div className="mt-2">
            <Snippet>{PROXY_EXAMPLE}</Snippet>
          </div>
          <p className="text-content-muted mt-2 text-sm leading-relaxed">{t('oauth.help.fixWebsocket')}</p>

          <p className="text-content-muted mt-4 text-sm leading-relaxed">{t('oauth.help.fixBuild')}</p>
          <div className="mt-2">
            <Snippet>{BUILD_EXAMPLE}</Snippet>
          </div>

          <h3 className="mt-6 text-sm font-semibold">{t('oauth.help.checkTitle')}</h3>
          <ul className="text-content-muted mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>{t('oauth.help.checkSiteUrl')}</li>
            <li>{t('oauth.help.checkRedirect', { redirect: redirectUrl })}</li>
          </ul>

          <p className="text-content-muted mt-6 text-sm leading-relaxed">{t('oauth.help.fallback')}</p>

          <Button variant="outline" className="mt-6 w-full" onClick={() => onOpenChange(false)}>
            {tCommon('action.close')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** The callback comes from the gateway, but a malformed one must not blank the dialog. */
const safeOrigin = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};
