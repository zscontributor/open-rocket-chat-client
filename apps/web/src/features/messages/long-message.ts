import { format } from 'date-fns';

/**
 * Turning a draft the server would refuse into the file it will accept.
 *
 * Rocket.Chat caps a message at `Message_MaxAllowedSize` characters, and its
 * own client answers a longer one by offering to post it as a plain-text
 * upload instead. We do the same, so a wall of text pasted into this client
 * lands in the room the way it would have from any other one — as an
 * attachment everybody can open, rather than a send that fails.
 */

/** The name Rocket.Chat gives the upload: who wrote it, and when. */
export const longMessageFileName = (username: string, at: Date): string =>
  // Rocket.Chat stamps the raw `Date`, which puts colons and a timezone in
  // parentheses into the name; a sortable stamp reads better and survives
  // being downloaded onto Windows.
  `${username || 'anonymous'} - ${format(at, 'yyyy-MM-dd HH-mm-ss')}.txt`;

export const longMessageFile = (text: string, username: string, at: Date): File =>
  new File([text], longMessageFileName(username, at), { type: 'text/plain', lastModified: at.getTime() });
