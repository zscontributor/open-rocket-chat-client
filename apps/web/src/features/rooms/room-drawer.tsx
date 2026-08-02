import type { UserSummary } from '@open-rocket-chat/client-sdk';
import * as Dialog from '@radix-ui/react-dialog';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { showFeatureNotice, type UnavailableReason } from '@/features/server/feature-notice-store';
import {
  CREATE_ROOM_KINDS,
  canCreateRoom,
  canEncryptNewRoom,
  canSetReadOnlyOnNewRoom,
  useCapabilities,
  type Capabilities,
  type CreateRoomKind,
} from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { SwitchField } from '@/ui/switch';
import { MemberPicker } from './member-picker';
import { RoomEditForm } from './room-edit-form';
import { useRoomDrawerStore } from './room-drawer-store';
import { RoomNameSettingsHelp, roomNameProblem, useRoomNameCopy } from './room-name';
import { useCreateDirectRoom, useCreateRoom } from './use-room-actions';
import { useRoom } from './use-rooms';

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
 * `locked` renders the option exactly as it always was, only muted: it stays
 * clickable so pressing it can explain the refusal, which is the whole point of
 * leaving it on screen.
 */
const KindOption = ({
  active,
  locked,
  icon,
  label,
  hint,
  onSelect,
}: {
  active: boolean;
  locked: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onSelect}
    className={cn(
      'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
      active ? 'border-accent bg-accent-subtle' : 'border-line hover:bg-sunken',
      locked && 'opacity-60',
    )}
  >
    <span className={cn('mt-0.5', active ? 'text-accent' : 'text-content-muted')}>{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium">{label}</span>
      <span className="text-content-muted block text-xs">{hint}</span>
    </span>
    {locked ? (
      <Icons.private size={16} className="text-content-muted shrink-0" />
    ) : active ? (
      <Icons.success size={18} className="text-accent shrink-0" />
    ) : null}
  </button>
);

/** Icon, copy and the notice each kind raises when the server refuses it. */
const KIND_COPY = {
  channel: {
    icon: Icons.channel,
    label: 'create.channel',
    hint: 'create.channelHint',
    notice: 'createChannel',
  },
  private: {
    icon: Icons.private,
    label: 'create.private',
    hint: 'create.privateHint',
    notice: 'createPrivate',
  },
  direct: {
    icon: Icons.direct,
    label: 'create.direct',
    hint: 'create.directHint',
    notice: 'createDirect',
  },
} as const satisfies Record<CreateRoomKind, { notice: UnavailableReason } & Record<string, unknown>>;

/**
 * The fields, mounted only once the permitted kinds are known.
 *
 * Split from `CreateForm` so `kind` can be seeded from that list: a `useState`
 * initialiser runs once, and seeding it while capabilities were still loading
 * would leave the form stuck on whichever kind happened to be the fallback.
 */
const CreateFields = ({
  capabilities,
  kinds,
  onDone,
}: {
  capabilities: Capabilities;
  /** The kinds this account may actually create. Never empty. */
  kinds: CreateRoomKind[];
  onDone: () => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const createRoom = useCreateRoom();
  // The reason goes above the submit button below, so no toast on top of it.
  const createDirect = useCreateDirectRoom({ silentError: true });

  const [kind, setKind] = useState<CreateRoomKind>(kinds[0] as CreateRoomKind);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const [members, setMembers] = useState<UserSummary[]>([]);
  const [memberQuery, setMemberQuery] = useState('');

  const pending = createRoom.isPending || createDirect.isPending;
  const error = createRoom.error ?? createDirect.error;

  // Rocket.Chat's create-channel modal checks `set-readonly` against the room
  // the user is about to own, and offers encryption only where it can apply.
  const canSetReadOnly = canSetReadOnlyOnNewRoom(capabilities);
  const canEncrypt = canEncryptNewRoom(capabilities, kind);

  // A broadcast room is read-only by definition — the server sets the flag
  // regardless — and a room that is not private has nobody to key encryption
  // to, so both are derived rather than left to the switches to keep in step.
  const effectiveReadOnly = broadcast || readOnly;
  const effectiveEncrypted = canEncrypt && encrypted;

  const trimmedName = name.trim();
  // A direct message takes a username, which the room-name rule does not govern.
  const nameProblem = kind === 'direct' || !trimmedName ? null : roomNameProblem(trimmedName, capabilities);
  const nameCopy = useRoomNameCopy(capabilities, nameProblem);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName || pending) return;

    if (kind === 'direct') {
      createDirect.mutate(trimmedName, { onSuccess: onDone });
      return;
    }

    if (nameProblem) return;

    createRoom.mutate(
      {
        type: kind,
        name: trimmedName,
        ...(topic.trim() ? { topic: topic.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        // The creator is added by the server, so only the invitees travel.
        ...(members.length > 0 ? { memberUsernames: members.map((user) => user.username) } : {}),
        readOnly: effectiveReadOnly,
        ...(effectiveEncrypted ? { encrypted: true } : {}),
        ...(broadcast ? { broadcast: true } : {}),
      },
      { onSuccess: onDone },
    );
  };

  return (
    // `flex-1` rather than `h-full`: the form is a sibling of the drawer header,
    // so a full-height form pushes its own footer past the bottom edge.
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Every kind is listed, including the ones this server withholds:
            selecting one of those explains itself rather than doing nothing. */}
        <div className="space-y-2">
          {CREATE_ROOM_KINDS.map((option) => {
            const copy = KIND_COPY[option];
            const KindIcon = copy.icon;
            const locked = !kinds.includes(option);
            return (
              <KindOption
                key={option}
                active={kind === option}
                locked={locked}
                icon={<KindIcon size={18} />}
                label={t(copy.label)}
                hint={t(copy.hint)}
                onSelect={() => (locked ? showFeatureNotice(copy.notice) : setKind(option))}
              />
            );
          })}
        </div>

        <Field
          id="room-name"
          label={kind === 'direct' ? t('create.members') : t('create.name')}
          hint={kind === 'direct' ? undefined : nameCopy.hint}
          error={nameCopy.error}
        >
          <Input
            id="room-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'direct' ? t('create.membersPlaceholder') : t('create.namePlaceholder')}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? 'room-name-error' : undefined}
            autoFocus
            required
          />
        </Field>

        {nameProblem === 'nameInvalid' ? <RoomNameSettingsHelp /> : null}

        {kind !== 'direct' ? (
          <>
            {/* Directly under the name: who the room is for is part of naming it,
                and the optional metadata below is easier to skip than to scroll past. */}
            <Field
              id="room-members"
              label={t('create.members')}
              hint={
                members.length > 0 ? t('create.membersSelected', { count: members.length }) : t('create.membersHint')
              }
            >
              <MemberPicker value={members} onChange={setMembers} query={memberQuery} onQueryChange={setMemberQuery} />
            </Field>

            <Field id="room-topic" label={t('create.topic')}>
              <Input id="room-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
            </Field>

            <Field id="room-description" label={t('create.description')}>
              <textarea
                id="room-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="border-line bg-app text-content placeholder:text-content-muted focus:border-focus w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
              />
            </Field>

            <div className="border-line divide-line divide-y border-t pt-2">
              <SwitchField
                id="room-read-only"
                label={t('create.readOnly')}
                hint={
                  broadcast
                    ? t('create.readOnlyBroadcastHint')
                    : canSetReadOnly
                      ? t('create.readOnlyHint')
                      : t('create.readOnlyDeniedHint')
                }
                checked={effectiveReadOnly}
                // Only the broadcast rule genuinely fixes this switch; a
                // missing permission leaves it live so it can say so.
                disabled={broadcast}
                onCheckedChange={(next) => (canSetReadOnly ? setReadOnly(next) : showFeatureNotice('setReadOnly'))}
              />
              <SwitchField
                id="room-broadcast"
                label={t('create.broadcast')}
                hint={t('create.broadcastHint')}
                checked={broadcast}
                onCheckedChange={setBroadcast}
              />
              <SwitchField
                id="room-encrypted"
                label={t('create.encrypted')}
                hint={
                  canEncrypt
                    ? t('create.encryptedHint')
                    : kind === 'private'
                      ? t('create.encryptedOffHint')
                      : t('create.encryptedPrivateOnlyHint')
                }
                checked={effectiveEncrypted}
                // A public room simply has nobody to key to, which the hint
                // says; the server having E2E off is worth a notice.
                disabled={kind !== 'private'}
                onCheckedChange={(next) => (canEncrypt ? setEncrypted(next) : showFeatureNotice('encryption'))}
              />
            </div>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {describeError(error)}
          </p>
        ) : null}
      </div>

      <footer className="border-line flex shrink-0 justify-end gap-2 border-t px-5 py-3">
        <Button size="md" onClick={onDone}>
          {tCommon('action.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={!trimmedName || Boolean(nameProblem) || pending}>
          {pending ? <Spinner className="size-4" /> : null}
          {kind === 'direct' ? t('create.directSubmit') : t('create.submit')}
        </Button>
      </footer>
    </form>
  );
};

/**
 * Decides which kinds of room this user may create before showing the form.
 *
 * Rocket.Chat grants `create-c`, `create-p` and `create-d` separately, so a
 * server can withhold any combination of the three. Waiting for capabilities
 * rather than treating "not loaded yet" as "not permitted" is what keeps the
 * form from opening on a kind the user cannot actually create.
 */
const CreateForm = ({ onDone }: { onDone: () => void }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');
  const { data: capabilities, isPending } = useCapabilities();

  if (isPending || !capabilities) {
    return (
      <div className="text-content-muted flex flex-1 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" /> {tCommon('state.loading')}
      </div>
    );
  }

  const kinds = CREATE_ROOM_KINDS.filter((kind) => canCreateRoom(capabilities, kind));

  // The sidebar raises the notice rather than opening the drawer in this case,
  // so it is only reached when a permission is withdrawn mid-session. There is
  // no kind to seed the form with, so it says why instead of showing fields
  // whose submit button could never be pressed.
  if (kinds.length === 0) {
    return (
      <div className="text-content-muted flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-sm">
        <Icons.private size={24} className="opacity-50" />
        {t('create.notAllowed')}
      </div>
    );
  }

  return <CreateFields capabilities={capabilities} kinds={kinds} onDone={onDone} />;
};

/**
 * Waits for the room before mounting the fields.
 *
 * The alternative — render empty inputs and fill them from an effect — shows a
 * flash of blank fields and makes "has the user edited this?" ambiguous. The
 * `key` means a different room gets a fresh form rather than stale values.
 */
const EditForm = ({ roomId, onDone }: { roomId: string; onDone: () => void }) => {
  const { t: tCommon } = useTranslation('common');
  const { data: room } = useRoom(roomId);

  if (!room) {
    return (
      <div className="text-content-muted flex flex-1 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" /> {tCommon('state.loading')}
      </div>
    );
  }

  return <RoomEditForm key={room.id} room={room} onDone={onDone} />;
};

/**
 * Right-hand drawer for creating and editing rooms.
 *
 * A drawer rather than a centred modal because it sits where the Room Info
 * panel does — the same edge of the screen owns "details about a room" — and
 * because the form is tall enough that a modal would scroll awkwardly.
 */
export const RoomDrawer = () => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const drawer = useRoomDrawerStore((state) => state.drawer);
  const close = useRoomDrawerStore((state) => state.closeRoomDrawer);

  const open = drawer.mode !== 'closed';

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-panel border-line fixed top-0 right-0 z-40 flex h-full w-[min(28rem,100vw)] flex-col border-l shadow-lg outline-none"
        >
          <header className="border-line flex items-center justify-between border-b px-5 py-3.5">
            <Dialog.Title className="text-base font-semibold">
              {drawer.mode === 'edit' ? t('edit.title') : t('create.title')}
            </Dialog.Title>
            <Dialog.Close
              aria-label={tCommon('action.close')}
              className="text-content-muted hover:bg-sunken hover:text-content rounded-md p-1 transition-colors"
            >
              <Icons.close size={18} />
            </Dialog.Close>
          </header>

          {drawer.mode === 'edit' ? (
            <EditForm key={drawer.roomId} roomId={drawer.roomId} onDone={close} />
          ) : drawer.mode === 'create' ? (
            <CreateForm onDone={close} />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
