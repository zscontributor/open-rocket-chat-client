import type { FileRef, Message } from '@open-rocket-chat/client-sdk';

/**
 * Who wrote the message being forwarded, and when.
 *
 * Both arrive already resolved: which name a server shows is a capability the
 * caller reads, and the time format belongs to the reader's locale. Neither is
 * this module's business, so neither is looked up here.
 */
export interface ForwardAttribution {
  author: string;
  postedAt: string;
}

/**
 * Prefixes one line of the original.
 *
 * A blank line has to carry a bare `>` rather than nothing: an unprefixed blank
 * line closes the blockquote, which would drop everything after the first
 * paragraph out of the quote and leave it reading as the forwarder's own words.
 */
const quoteLine = (line: string): string => (line.trim().length > 0 ? `> ${line}` : '>');

/**
 * The text a forward posts: the original as a Markdown blockquote, headed by
 * its author, with the forwarder's own comment underneath.
 *
 * Rocket.Chat's own forward carries the original as a quote *attachment*, and
 * the gateway's send route takes text and nothing else — so there is no way to
 * ask for one from here. A blockquote is the closest the contract can express,
 * and unlike an attachment it reads correctly in every client that opens the
 * room afterwards, Rocket.Chat's own included.
 *
 * An upload with no caption quotes nothing but the attribution: its files are
 * forwarded as uploads of their own, and an empty quote box above them would
 * say less than the header already does.
 */
export const forwardedText = (attribution: ForwardAttribution, text: string, comment = ''): string => {
  const lines = [quoteLine(`**${attribution.author}** · ${attribution.postedAt}`)];

  if (text.trim().length > 0) {
    lines.push(...text.trimEnd().split('\n').map(quoteLine));
  }

  const note = comment.trim();

  // A blank line between the two, or the comment is swallowed into the quote.
  return note ? `${lines.join('\n')}\n\n${note}` : lines.join('\n');
};

/**
 * Every upload on the row being forwarded.
 *
 * A row can be an album — one upload of several files posts as several messages
 * — and forwarding it should carry all of them, exactly as deleting it removes
 * all of them.
 */
export const forwardedFiles = (messages: Message[]): FileRef[] => messages.flatMap((message) => message.files);
