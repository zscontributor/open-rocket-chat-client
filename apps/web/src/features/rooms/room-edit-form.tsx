import type { RoomSummary, RoomType } from '@open-rocket-chat/client-sdk';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarField } from '@/features/avatars/avatar-field';
import { useUpdateRoomAvatar } from '@/features/avatars/use-avatar';
import { showFeatureNotice } from '@/features/server/feature-notice-store';
import {
  canChangeRoomType,
  canEditRoomAvatar,
  hasPermission,
  useCapabilities,
} from '@/features/server/use-capabilities';
import { describeError } from '@/lib/errors';
import { Button } from '@/ui/button';
import { Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { SwitchField } from '@/ui/switch';
import { RoomNameSettingsHelp, roomNameProblem, useRoomNameCopy } from './room-name';
import { useUpdateRoom } from './use-room-actions';

const Field = ({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="text-danger text-xs">
        {error}
      </p>
    ) : hint ? (
      <p className="text-content-muted text-xs">{hint}</p>
    ) : null}
  </div>
);

/**
 * The room's own settings.
 *
 * Shared by the drawer — which edits any room from the sidebar — and the
 * contextual bar, which edits the one that is open. The two differ only in
 * where the form is mounted, so keeping one component is what stops the two
 * from drifting into disagreeing about which fields exist.
 *
 * `key` the caller on `room.id`: this seeds its state once, and a different
 * room needs a fresh form rather than the previous room's values.
 */
export const RoomEditForm = ({ room, onDone }: { room: RoomSummary; onDone: () => void }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const updateRoom = useUpdateRoom();
  const updateAvatar = useUpdateRoomAvatar(room.id);
  const { data: capabilities } = useCapabilities();

  const [name, setName] = useState(room.name ?? '');
  const [topic, setTopic] = useState(room.topic ?? '');
  const [description, setDescription] = useState(room.description ?? '');
  const [announcement, setAnnouncement] = useState(room.announcement ?? '');
  const [readOnly, setReadOnly] = useState(room.readOnly);
  const [archived, setArchived] = useState(room.archived);
  const [isPrivate, setPrivate] = useState(room.type !== 'channel');

  // Rocket.Chat grants these separately from `edit-room`, and a server that
  // withholds one still allows the rest of the form.
  const canSetReadOnly = hasPermission(capabilities, 'set-readonly', room.roles);
  const canArchive = hasPermission(capabilities, 'archive-room', room.roles);
  // Switching a room between public and private is the create permission for
  // the kind it is becoming, which is how Rocket.Chat gates the same toggle.
  const canChangeType = canChangeRoomType(capabilities, room);
  const canEditAvatar = canEditRoomAvatar(capabilities, room);

  const nameProblem = name.trim() ? roomNameProblem(name.trim(), capabilities) : null;
  const nameCopy = useRoomNameCopy(capabilities, nameProblem);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nameProblem) return;

    // Only what actually changed: Rocket.Chat applies every field it receives,
    // and resending an unchanged value can trip permission checks the user
    // does not need for the edit they made.
    const nextType: RoomType = isPrivate ? 'private' : 'channel';
    const changes = {
      ...(name !== (room.name ?? '') ? { name } : {}),
      ...(topic !== (room.topic ?? '') ? { topic } : {}),
      ...(description !== (room.description ?? '') ? { description } : {}),
      ...(announcement !== (room.announcement ?? '') ? { announcement } : {}),
      ...(readOnly !== room.readOnly ? { readOnly } : {}),
      ...(archived !== room.archived ? { archived } : {}),
      ...(nextType !== room.type && (room.type === 'channel' || room.type === 'private')
        ? { type: nextType as 'channel' | 'private' }
        : {}),
    };

    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }

    updateRoom.mutate({ roomId: room.id, changes }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Only when the server grants it: Rocket.Chat validates the avatar
            field of a settings save against `edit-room-avatar` on its own, so
            somebody who may rename a room is not necessarily allowed to
            re-picture it. Unlike the switches below there is nothing useful to
            show a person who cannot — a disabled file picker explains nothing —
            so the field is simply absent. */}
        {canEditAvatar ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('edit.avatar')}</p>
            <AvatarField
              name={room.displayName}
              src={room.avatarUrl}
              pending={updateAvatar.isPending}
              error={updateAvatar.error}
              onSelect={(image) => updateAvatar.mutate(image)}
              onRemove={() => updateAvatar.mutate(null)}
            />
          </div>
        ) : null}

        <Field id="edit-name" label={t('create.name')} hint={nameCopy.hint} error={nameCopy.error}>
          <Input
            id="edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? 'edit-name-error' : undefined}
            autoFocus
          />
        </Field>

        {nameProblem === 'nameInvalid' ? <RoomNameSettingsHelp /> : null}

        <Field id="edit-topic" label={t('create.topic')}>
          <Input id="edit-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </Field>

        <Field id="edit-description" label={t('create.description')}>
          <textarea
            id="edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="border-line bg-app text-content focus:border-focus w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
          />
        </Field>

        <Field id="edit-announcement" label={t('edit.announcement')} hint={t('edit.announcementHint')}>
          <Input
            id="edit-announcement"
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
          />
        </Field>

        <div className="border-line divide-line divide-y border-t pt-2">
          <SwitchField
            id="edit-private"
            label={t('edit.makePrivate')}
            hint={canChangeType ? t('edit.makePrivateHint') : t('edit.makePrivateDeniedHint')}
            checked={isPrivate}
            onCheckedChange={(next) => (canChangeType ? setPrivate(next) : showFeatureNotice('changeRoomType'))}
          />
          <SwitchField
            id="edit-read-only"
            label={t('create.readOnly')}
            hint={canSetReadOnly ? t('create.readOnlyHint') : t('create.readOnlyDeniedHint')}
            checked={readOnly}
            onCheckedChange={(next) => (canSetReadOnly ? setReadOnly(next) : showFeatureNotice('setReadOnly'))}
          />
          <SwitchField
            id="edit-archived"
            label={t('edit.archived')}
            hint={t('edit.archivedHint')}
            checked={archived}
            disabled={!canArchive}
            onCheckedChange={setArchived}
          />
        </div>

        {updateRoom.error ? (
          <p role="alert" className="text-danger text-sm">
            {describeError(updateRoom.error)}
          </p>
        ) : null}
      </div>

      <footer className="border-line flex shrink-0 justify-end gap-2 border-t px-5 py-3">
        <Button size="md" onClick={onDone}>
          {tCommon('action.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={Boolean(nameProblem) || updateRoom.isPending}>
          {updateRoom.isPending ? <Spinner className="size-4" /> : null}
          {t('edit.submit')}
        </Button>
      </footer>
    </form>
  );
};
