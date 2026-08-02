import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/lib/errors';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { SwitchField } from '@/ui/switch';
import { PanelBody } from '../panel';
import { usePruneMessages } from '../use-member-actions';

/**
 * Combines a date and a time input into an instant.
 *
 * Both are optional and each has a sensible far end, so "everything before
 * Friday" and "everything after Monday" are both expressible — which is how
 * Rocket.Chat's own form behaves.
 */
const toInstant = (date: string, time: string, edge: 'start' | 'end'): string | undefined => {
  if (!date) return undefined;
  const parsed = new Date(`${date}T${time || (edge === 'start' ? '00:00' : '23:59')}:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const DateTimeRow = ({
  label,
  date,
  time,
  onDate,
  onTime,
  id,
}: {
  label: string;
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  id: string;
}) => (
  <div className="space-y-1.5">
    <label htmlFor={`${id}-date`} className="block text-sm font-medium">
      {label}
    </label>
    <div className="flex gap-2">
      <Input id={`${id}-date`} type="date" value={date} onChange={(event) => onDate(event.target.value)} />
      <Input
        id={`${id}-time`}
        type="time"
        aria-label={`${label} — time`}
        value={time}
        onChange={(event) => onTime(event.target.value)}
        className="w-32"
      />
    </div>
  </div>
);

/**
 * Bulk deletion.
 *
 * Irreversible and unbounded by default, so this is the one panel that refuses
 * to act on a bare click: the confirmation restates the room by name, and the
 * result says how many messages actually went — including zero, which is a real
 * answer rather than a failure.
 */
export const PrunePanel = ({ room, roomId }: { room: RoomSummary | undefined; roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const prune = usePruneMessages(roomId);

  const [newerDate, setNewerDate] = useState('');
  const [newerTime, setNewerTime] = useState('');
  const [olderDate, setOlderDate] = useState('');
  const [olderTime, setOlderTime] = useState('');
  const [usernames, setUsernames] = useState('');
  const [inclusive, setInclusive] = useState(false);
  const [excludePinned, setExcludePinned] = useState(false);
  const [filesOnly, setFilesOnly] = useState(false);
  const [ignoreThreads, setIgnoreThreads] = useState(true);
  const [ignoreDiscussion, setIgnoreDiscussion] = useState(true);

  const [confirming, setConfirming] = useState(false);

  const request = {
    oldest: toInstant(newerDate, newerTime, 'start'),
    latest: toInstant(olderDate, olderTime, 'end'),
    inclusive,
    excludePinned,
    filesOnly,
    ignoreThreads,
    ignoreDiscussion,
    usernames: usernames
      .split(/[\s,]+/)
      .map((name) => name.replace(/^@/, '').trim())
      .filter(Boolean),
    limit: 2000,
  };

  return (
    <>
      <PanelBody>
        <div className="space-y-4 px-4 py-4">
          <p className="text-content-muted text-xs">{t('prune.intro')}</p>

          <DateTimeRow
            id="prune-newer"
            label={t('prune.newerThan')}
            date={newerDate}
            time={newerTime}
            onDate={setNewerDate}
            onTime={setNewerTime}
          />
          <DateTimeRow
            id="prune-older"
            label={t('prune.olderThan')}
            date={olderDate}
            time={olderTime}
            onDate={setOlderDate}
            onTime={setOlderTime}
          />

          <div className="space-y-1.5">
            <label htmlFor="prune-users" className="block text-sm font-medium">
              {t('prune.onlyFrom')}
            </label>
            <Input
              id="prune-users"
              value={usernames}
              onChange={(event) => setUsernames(event.target.value)}
              placeholder={t('prune.onlyFromPlaceholder')}
            />
            <p className="text-content-muted text-xs">{t('prune.onlyFromHint')}</p>
          </div>

          <div className="border-line divide-line divide-y border-t pt-1">
            <SwitchField
              id="prune-inclusive"
              label={t('prune.inclusive')}
              hint={t('prune.inclusiveHint')}
              checked={inclusive}
              onCheckedChange={setInclusive}
            />
            <SwitchField
              id="prune-exclude-pinned"
              label={t('prune.excludePinned')}
              checked={excludePinned}
              onCheckedChange={setExcludePinned}
            />
            <SwitchField
              id="prune-files-only"
              label={t('prune.filesOnly')}
              hint={t('prune.filesOnlyHint')}
              checked={filesOnly}
              onCheckedChange={setFilesOnly}
            />
            <SwitchField
              id="prune-ignore-threads"
              label={t('prune.ignoreThreads')}
              checked={ignoreThreads}
              onCheckedChange={setIgnoreThreads}
            />
            <SwitchField
              id="prune-ignore-discussions"
              label={t('prune.ignoreDiscussions')}
              checked={ignoreDiscussion}
              onCheckedChange={setIgnoreDiscussion}
            />
          </div>

          {prune.isSuccess ? (
            <p
              role="status"
              className="border-line bg-sunken text-content-secondary flex items-center gap-2 rounded-lg border p-3 text-sm"
            >
              <Icons.success size={16} className="text-success shrink-0" />
              {prune.data.count === 0 ? t('prune.nothingPruned') : t('prune.pruned', { count: prune.data.count })}
            </p>
          ) : null}

          {prune.error ? (
            <p role="alert" className="text-danger text-sm">
              {describeError(prune.error)}
            </p>
          ) : null}
        </div>
      </PanelBody>

      <footer className="border-line shrink-0 border-t px-4 py-3">
        <Button
          variant="primary"
          size="md"
          className="bg-danger hover:bg-danger/90 w-full"
          disabled={prune.isPending}
          onClick={() => setConfirming(true)}
        >
          {prune.isPending ? <Spinner className="size-4" /> : <Icons.eraser size={16} />}
          {t('prune.submit')}
        </Button>
      </footer>

      {confirming ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('prune.confirm.title')}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={tCommon('action.cancel')}
            className="bg-overlay absolute inset-0"
            onClick={() => setConfirming(false)}
          />
          <div className="bg-panel border-line relative w-full max-w-sm rounded-xl border p-5 shadow-lg">
            <h2 className="text-base font-semibold">{t('prune.confirm.title')}</h2>
            <p className="text-content-muted mt-1.5 text-sm">
              {t('prune.confirm.detail', { room: room?.displayName ?? '' })}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" onClick={() => setConfirming(false)}>
                {tCommon('action.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="bg-danger hover:bg-danger/90"
                onClick={() => {
                  prune.mutate(request);
                  setConfirming(false);
                }}
              >
                {t('prune.confirm.confirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
