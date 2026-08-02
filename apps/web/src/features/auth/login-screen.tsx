import { useTranslation } from 'react-i18next';

import { Icons } from '@/ui/icon';
import { LoginForm } from './login-form';
import { useServers } from './use-session';

export const LoginScreen = () => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { data: servers } = useServers();

  return (
    <div className="bg-sunken flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="bg-accent text-accent-content flex size-12 items-center justify-center rounded-xl">
            <Icons.direct size={26} weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{tCommon('appName')}</h1>
            <p className="text-content-muted mt-1 text-sm">{t('title')}</p>
          </div>
        </div>

        <LoginForm
          servers={servers?.servers ?? []}
          defaultServerId={servers?.defaultServerId ?? undefined}
          className="bg-panel border-line space-y-4 rounded-xl border p-6 shadow-sm"
        />

        <p className="text-content-muted mt-6 text-center text-xs leading-relaxed whitespace-pre-line">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  );
};
