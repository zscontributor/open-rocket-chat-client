import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';
import { SwitchField } from '@/ui/switch';
import { notificationsSupported, requestNotificationPermission, useNotificationPermission } from './permission';
import { useNotificationPreferences } from './preferences';
import { playNotificationSound } from './sound';

/**
 * The Settings tab for desktop notifications.
 *
 * Its main job is the permission button. The app asks for permission on
 * startup, as Rocket.Chat does, but Firefox and Safari refuse a request that
 * did not come from a click — so without something to press, notifications
 * would be permanently unavailable there with no way to find out why.
 */
export const NotificationSettings = () => {
  const { t } = useTranslation('settings');

  const permission = useNotificationPermission();
  const requireInteraction = useNotificationPreferences((state) => state.requireInteraction);
  const setRequireInteraction = useNotificationPreferences((state) => state.setRequireInteraction);
  const muteFocusedConversations = useNotificationPreferences((state) => state.muteFocusedConversations);
  const setMuteFocusedConversations = useNotificationPreferences((state) => state.setMuteFocusedConversations);
  const soundVolume = useNotificationPreferences((state) => state.soundVolume);
  const setSoundVolume = useNotificationPreferences((state) => state.setSoundVolume);

  const supported = notificationsSupported();

  return (
    <div>
      {!supported ? (
        <p className="text-content-muted text-xs">{t('notifications.unsupported')}</p>
      ) : (
        <>
          <div className="border-line mb-3 flex items-start gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(`notifications.permission.${permission}`)}</p>
              <p className="text-content-muted mt-0.5 text-xs">{t(`notifications.permissionHint.${permission}`)}</p>
            </div>

            {/* Only offered while the browser might still say yes: once it has
                been refused, permission can only be given back from the site
                controls, and a button that cannot work is worse than none. */}
            {permission === 'default' ? (
              <Button size="sm" variant="primary" onClick={() => void requestNotificationPermission()}>
                {t('notifications.enable')}
              </Button>
            ) : null}
          </div>

          <div className="divide-line divide-y">
            <SwitchField
              id="notify-mute-focused"
              label={t('notifications.muteFocused')}
              hint={t('notifications.muteFocusedHint')}
              checked={muteFocusedConversations}
              onCheckedChange={setMuteFocusedConversations}
              disabled={permission !== 'granted'}
            />
            <SwitchField
              id="notify-require-interaction"
              label={t('notifications.requireInteraction')}
              hint={t('notifications.requireInteractionHint')}
              checked={requireInteraction}
              onCheckedChange={setRequireInteraction}
              disabled={permission !== 'granted'}
            />
          </div>
        </>
      )}

      {/*
       * Outside the branch above on purpose: the sound is an ordinary `<audio>`
       * element, so it works in a browser that has no Notification API and on a
       * site whose notifications have been blocked. Somebody who cannot be shown
       * a banner can still be told a message arrived.
       */}
      <div className={cn('border-line pt-3', supported && 'mt-3 border-t')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="notify-sound-volume" className="block text-sm font-medium">
              {t('notifications.soundVolume')}
            </label>
            <p className="text-content-muted mt-0.5 text-xs">{t('notifications.soundVolumeHint')}</p>
          </div>

          {/* A slider for something you cannot hear until the next message
              arrives is guesswork; this plays it at the level just chosen. */}
          <Button
            size="icon"
            variant="subtle"
            aria-label={t('notifications.soundPreview')}
            title={t('notifications.soundPreview')}
            disabled={soundVolume === 0}
            onClick={() => playNotificationSound(soundVolume)}
          >
            <Icons.sound size={16} />
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <input
            id="notify-sound-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={soundVolume}
            onChange={(event) => setSoundVolume(Number(event.target.value))}
            // Left at the browser's own height: constraining a range input
            // clips its thumb rather than thinning its track.
            className="accent-accent flex-1 cursor-pointer"
          />
          {/* Tabular figures, so the number does not jitter as it is dragged. */}
          <span className="text-content-muted w-9 text-right text-xs tabular-nums">
            {soundVolume === 0 ? t('notifications.soundOff') : `${soundVolume}%`}
          </span>
        </div>
      </div>
    </div>
  );
};
