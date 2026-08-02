import { AVATAR_ACCEPT } from '@open-rocket-chat/client-sdk';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCapabilities } from '@/features/server/use-capabilities';
import { describeError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { avatarFileProblem, type AvatarProblem } from './avatar-file';

/**
 * The picture, and the two things that can be done to it.
 *
 * Shared by the account dialog and the room edit form because they are the same
 * control over two subjects: Rocket.Chat stores a user avatar and a room avatar
 * the same way, offers the same two operations on each, and refuses the same
 * files. Keeping one component is what stops the two from drifting into
 * disagreeing about which images are allowed.
 *
 * The file is validated here rather than by each caller, and uploaded straight
 * away rather than held for a submit button: the change stands on its own, and
 * a picture waiting behind an unrelated "Save" reads as though nothing
 * happened.
 */
export const AvatarField = ({
  name,
  src,
  pending,
  error,
  onSelect,
  onRemove,
}: {
  /** Falls back to initials, exactly as the avatar does everywhere else. */
  name: string;
  src: string | null;
  pending: boolean;
  error: unknown;
  onSelect: (image: File) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('common');
  const { data: capabilities } = useCapabilities();

  const picker = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const [problem, setProblem] = useState<AvatarProblem | null>(null);

  const maxBytes = capabilities?.settings.fileUpload.maxFileSizeBytes ?? 0;
  const message = problem
    ? problem === 'size'
      ? t('avatar.error.size', { size: formatBytes(maxBytes) })
      : t('avatar.error.type')
    : error
      ? describeError(error)
      : null;

  const choose = (file: File | undefined) => {
    if (!file) return;

    const rejection = avatarFileProblem(capabilities, file);
    setProblem(rejection);
    if (!rejection) onSelect(file);
  };

  return (
    <div className="flex items-center gap-4">
      <span className="relative shrink-0">
        <Avatar name={name} src={src} size="xl" />
        {/* Over the picture rather than beside it: the upload takes a moment,
            and the thing being replaced is what the wait belongs to. */}
        {pending ? (
          <span className="bg-overlay absolute inset-0 flex items-center justify-center rounded-lg">
            <Spinner className="text-content-inverted size-5" />
          </span>
        ) : null}
      </span>

      <div className="min-w-0 flex-1">
        <input
          ref={picker}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            // Reset so picking the same file twice still fires a change — which
            // is exactly what somebody does after a rejected first attempt.
            event.target.value = '';
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            aria-describedby={message ? messageId : undefined}
            onClick={() => picker.current?.click()}
          >
            <Icons.upload size={16} />
            {t('avatar.upload')}
          </Button>
          {src ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setProblem(null);
                onRemove();
              }}
            >
              {t('avatar.remove')}
            </Button>
          ) : null}
        </div>

        {message ? (
          <p id={messageId} role="alert" className="text-danger mt-1.5 text-xs">
            {message}
          </p>
        ) : (
          <p className="text-content-muted mt-1.5 text-xs">{t('avatar.hint')}</p>
        )}
      </div>
    </div>
  );
};
