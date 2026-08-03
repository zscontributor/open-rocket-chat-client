/**
 * Who wrote the message being quoted, and when.
 *
 * Both arrive already resolved: which name a server shows is a capability the
 * caller reads, and the time format belongs to the reader's locale. Neither is
 * this module's business, so neither is looked up here.
 */
export interface QuoteAttribution {
  author: string;
  postedAt: string;
}

/**
 * The stamp above the quote.
 *
 * Longer than the `HH:mm` the timeline prints beside a message: a quote is read
 * away from the row it was taken from — in another room after a forward, or
 * pages further down the same one — and there is no date separator overhead to
 * read the rest of the date from.
 */
export const QUOTE_STAMP_FORMAT = 'd MMM yyyy, HH:mm';

/**
 * Prefixes one line of the original.
 *
 * A blank line has to carry a bare `>` rather than nothing: an unprefixed blank
 * line closes the blockquote, which would drop everything after the first
 * paragraph out of the quote and leave it reading as the quoter's own words.
 */
const quoteLine = (line: string): string => (line.trim().length > 0 ? `> ${line}` : '>');

/**
 * A message quoted as Markdown: the original as a blockquote, headed by its
 * author, with whatever the quoter had to say underneath it.
 *
 * Rocket.Chat's own quote is an *attachment*, made server-side out of a
 * permalink written into the message text. Neither half is available here: the
 * gateway's send route takes text and attachment ids and nothing else, and it
 * never tells a client the Rocket.Chat URL a permalink would have to be built
 * from. A blockquote is what the contract can express, and unlike an attachment
 * it reads correctly in every client that opens the room afterwards —
 * Rocket.Chat's own included.
 *
 * A message with no text quotes nothing but the attribution: an upload's files
 * are not carried by the quote, and an empty quote box would say less than the
 * header already does.
 */
export const quotedText = (attribution: QuoteAttribution, text: string, comment = ''): string => {
  const lines = [quoteLine(`**${attribution.author}** · ${attribution.postedAt}`)];

  if (text.trim().length > 0) {
    lines.push(...text.trimEnd().split('\n').map(quoteLine));
  }

  const note = comment.trim();

  // A blank line between the two, or the comment is swallowed into the quote.
  return note ? `${lines.join('\n')}\n\n${note}` : lines.join('\n');
};
