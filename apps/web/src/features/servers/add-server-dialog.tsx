import type { ServerDescriptor } from '@open-rocket-chat/client-sdk';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoginForm } from '@/features/auth/login-form';
import { useServers, useSession } from '@/features/auth/use-session';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';
import { useServerStore } from './server-store';

/**
 * What the gateway advertises about one server: the name it was configured
 * under and the Rocket.Chat URL behind it.
 *
 * The name is the gateway's label, not anything Rocket.Chat reports, so it only
 * means something next to the URL it points at — two entries can easily be the
 * same deployment under different names, or share a name across environments.
 * A null version is the gateway saying it could not reach the server.
 */
const ServerIdentity = ({ server }: { server: ServerDescriptor }) => {
  const { t } = useTranslation('servers');

  return (
    <>
      {/* Spans throughout: this also renders inside a button, where a div
          would be invalid markup. */}
      <span className="flex items-baseline gap-2">
        <span className="truncate text-sm font-medium">{server.name}</span>
        <span className={cn('shrink-0 text-xs', server.version ? 'text-content-muted' : 'text-danger')}>
          {server.version ?? t('status.unreachable')}
        </span>
      </span>
      <span className="text-content-muted block truncate text-xs" title={server.baseUrl}>
        {server.baseUrl}
      </span>
    </>
  );
};

/**
 * Signs in to an additional Rocket.Chat server.
 *
 * The gateway attaches the new connection to the existing session cookie, so
 * nothing here has to know that a session is already open — it is the same
 * login exchange, and the servers already signed in to are simply left out of
 * the picker.
 */
export const AddServerDialog = () => {
  const { t } = useTranslation('servers');
  const { t: tCommon } = useTranslation('common');
  const open = useServerStore((state) => state.addingServer);
  const setAddingServer = useServerStore((state) => state.setAddingServer);

  const { data: session } = useSession();
  const { data: servers } = useServers();

  const connectedIds = new Set(session?.connections.map((connection) => connection.server.id));
  const available = (servers?.servers ?? []).filter((server) => !connectedIds.has(server.id));

  // Picking happens here rather than in the form's own select, so the choice
  // can show the URL behind each name. Falls back to the first entry, which
  // also covers a pick that has since been signed in to from elsewhere.
  const [selectedId, setSelectedId] = useState<string>();
  const selected = available.find((server) => server.id === selectedId) ?? available[0];

  return (
    <Dialog.Root open={open} onOpenChange={setAddingServer}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-base font-semibold">{t('add.title')}</Dialog.Title>

            {/* Escape and a click outside already close the dialog, but neither
                is discoverable — and the "nothing left to add" state below has
                no other control at all. */}
            <Dialog.Close
              aria-label={tCommon('action.close')}
              className="text-content-muted hover:bg-sunken hover:text-content -mt-1 -mr-1 rounded-md p-1 transition-colors"
            >
              <Icons.close size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-content-muted mt-1 mb-5 text-sm">
            {t('add.description')}
          </Dialog.Description>

          {available.length === 0 ? (
            <div className="space-y-4">
              <p className="text-content-muted text-sm">{t('add.allConnected')}</p>
              <Button variant="outline" className="w-full" onClick={() => setAddingServer(false)}>
                {tCommon('action.close')}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                {/* With one server there is nothing to pick, so the line names
                    it outright — which server is being signed in to is the
                    thing worth saying, and it is the gateway's own label. */}
                <p className="text-content-muted text-xs">
                  {available.length > 1
                    ? t('add.chooseGatewayServer')
                    : t('add.gatewayServer', { name: available[0]!.name })}
                </p>

                {available.length === 1 ? (
                  <div className="border-line bg-sunken rounded-lg border px-3 py-2">
                    <ServerIdentity server={available[0]!} />
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label={t('add.serverList')}
                    className="max-h-52 space-y-1.5 overflow-y-auto"
                  >
                    {available.map((server) => (
                      <button
                        key={server.id}
                        type="button"
                        role="radio"
                        aria-checked={server.id === selected?.id}
                        onClick={() => setSelectedId(server.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                          server.id === selected?.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-sunken',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <ServerIdentity server={server} />
                        </span>

                        {server.id === selected?.id ? (
                          <Icons.success size={18} className="text-accent shrink-0" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <LoginForm
                // Remounted per server set so the fields reset rather than
                // carrying a half-typed username into the next attempt. Not
                // keyed on the selection: switching servers mid-typing should
                // keep what was typed.
                key={available.map((server) => server.id).join(',')}
                // A single entry hides the form's own picker — the list above
                // already shows, and chooses, the server.
                servers={selected ? [selected] : available}
                defaultServerId={selected?.id}
                onSuccess={() => setAddingServer(false)}
                className="space-y-4"
              />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
