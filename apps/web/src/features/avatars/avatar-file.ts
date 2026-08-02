import { isAvatarMediaType } from '@open-rocket-chat/client-sdk';

import type { Capabilities } from '@/features/server/use-capabilities';

/** Why a chosen file cannot become an avatar, or `null` when it can. */
export type AvatarProblem = 'type' | 'size';

/**
 * Checks a picked file before anything is uploaded.
 *
 * The size ceiling is the server's own upload limit rather than one invented
 * here: Rocket.Chat validates an avatar against `FileUpload_MaxFileSize`, the
 * same setting the message composer already reads, and a client that guessed
 * would either refuse files the server accepts or wave through files it does
 * not.
 *
 * The media-type check is deliberately not the composer's: uploads obey the
 * server's allow and block lists, while an avatar only has to be an image
 * Rocket.Chat can render back — a server that blocks `image/gif` attachments
 * still stores a GIF avatar.
 */
export const avatarFileProblem = (
  capabilities: Capabilities | undefined,
  file: { type: string; size: number },
): AvatarProblem | null => {
  if (!isAvatarMediaType(file.type)) return 'type';

  const maxBytes = capabilities?.settings.fileUpload.maxFileSizeBytes ?? 0;
  if (maxBytes > 0 && file.size > maxBytes) return 'size';

  return null;
};
