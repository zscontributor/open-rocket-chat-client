import type { NotificationAlert, UpdateRoomNotificationsRequest } from '@open-rocket-chat/client-sdk';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/lib/errors';
import { Icons, Spinner } from '@/ui/icon';
import { Select } from '@/ui/select';
import { SwitchField } from '@/ui/switch';
import { PanelBody } from '../panel';
import { useRoomNotifications, useUpdateRoomNotifications } from '../use-panels';

const ALERTS: NotificationAlert[] = ['default', 'all', 'mentions', 'nothing'];

/** Rocket.Chat offers the built-in sounds by name plus whatever is uploaded. */
const SOUNDS = ['default', 'none'];

const Device = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
  <section className="border-line border-t px-4 py-3">
    <h3 className="text-content-secondary flex items-center gap-2 pb-2 text-xs font-semibold tracking-wide uppercase">
      {icon}
      {label}
    </h3>
    <div className="space-y-3">{children}</div>
  </section>
);

const AlertField = ({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) => (
  <div className="flex items-center gap-3">
    <label htmlFor={id} className="text-content-secondary w-20 shrink-0 text-sm">
      {label}
    </label>
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)} options={options} />
  </div>
);

/**
 * Per-room notification settings.
 *
 * Saved on change rather than behind a Save button: every control is a single
 * independent value, the gateway merges rather than replaces, and a form that
 * silently discards a toggle because the user closed the panel is worse than
 * one request per switch.
 */
export const NotificationsPanel = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const { data: preferences, isPending, error } = useRoomNotifications(roomId);
  const update = useUpdateRoomNotifications(roomId);

  if (isPending) {
    return (
      <PanelBody>
        <p className="text-content-muted flex items-center justify-center gap-2 py-10 text-sm">
          <Spinner className="size-4" /> {tCommon('state.loading')}
        </p>
      </PanelBody>
    );
  }

  if (error || !preferences) {
    return (
      <PanelBody>
        <p role="alert" className="text-danger px-4 py-10 text-center text-sm">
          {tCommon('state.error')}
        </p>
      </PanelBody>
    );
  }

  const alertOptions = ALERTS.map((value) => ({ value, label: t(`notifications.alert.${value}`) }));
  const soundOptions = [
    { value: 'default', label: t('notifications.sound.default') },
    { value: 'none', label: t('notifications.sound.none') },
  ];

  // The gateway merges, so a partial device object is a legitimate patch even
  // though the stored shape has both fields.
  const save = (changes: UpdateRoomNotificationsRequest) => update.mutate(changes);

  return (
    <PanelBody>
      <div className="divide-line divide-y px-4">
        <SwitchField
          id="notify-enabled"
          label={t('notifications.turnOn')}
          hint={t('notifications.turnOnHint')}
          checked={preferences.enabled}
          onCheckedChange={(enabled) => save({ enabled })}
        />
        <SwitchField
          id="notify-group-mentions"
          label={t('notifications.muteGroupMentions')}
          hint={t('notifications.muteGroupMentionsHint')}
          checked={preferences.muteGroupMentions}
          onCheckedChange={(muteGroupMentions) => save({ muteGroupMentions })}
        />
        <SwitchField
          id="notify-counter"
          label={t('notifications.showCounter')}
          hint={t('notifications.showCounterHint')}
          checked={preferences.showCounter}
          onCheckedChange={(showCounter) => save({ showCounter })}
        />
        {/* Rocket.Chat only offers this once the counter is off: with the
            counter showing, the mention badge is already implied. */}
        {!preferences.showCounter ? (
          <SwitchField
            id="notify-mentions"
            label={t('notifications.showMentions')}
            hint={t('notifications.showMentionsHint')}
            checked={preferences.showMentions}
            onCheckedChange={(showMentions) => save({ showMentions })}
          />
        ) : null}
      </div>

      <Device icon={<Icons.desktop size={14} />} label={t('notifications.desktop')}>
        <AlertField
          id="notify-desktop-alert"
          label={t('notifications.alertLabel')}
          value={preferences.desktop.alert}
          onChange={(alert) => save({ desktop: { alert: alert as NotificationAlert } })}
          options={alertOptions}
        />
        <AlertField
          id="notify-desktop-sound"
          label={t('notifications.soundLabel')}
          value={preferences.desktop.sound}
          onChange={(sound) => save({ desktop: { sound } })}
          // A server can define custom sounds; anything not in the built-in
          // list is still shown so a stored choice is never silently dropped.
          options={
            SOUNDS.includes(preferences.desktop.sound)
              ? soundOptions
              : [...soundOptions, { value: preferences.desktop.sound, label: preferences.desktop.sound }]
          }
        />
      </Device>

      <Device icon={<Icons.mobile size={14} />} label={t('notifications.mobile')}>
        <AlertField
          id="notify-mobile-alert"
          label={t('notifications.alertLabel')}
          value={preferences.mobile.alert}
          onChange={(alert) => save({ mobile: { alert: alert as NotificationAlert } })}
          options={alertOptions}
        />
      </Device>

      <Device icon={<Icons.email size={14} />} label={t('notifications.email')}>
        <AlertField
          id="notify-email-alert"
          label={t('notifications.alertLabel')}
          value={preferences.email.alert}
          onChange={(alert) => save({ email: { alert: alert as NotificationAlert } })}
          options={alertOptions}
        />
      </Device>

      {update.error ? (
        <p role="alert" className="text-danger px-4 py-3 text-sm">
          {describeError(update.error)}
        </p>
      ) : null}
    </PanelBody>
  );
};
