/**
 * Whether a message body is nothing but one quote or one code block.
 *
 * Both of those draw their own frame — the code block a filled panel, the quote
 * a rule down its left edge — so a message that holds only one of them would be
 * a box inside a box. The timeline drops the bubble's fill and border in that
 * case and lets the block be the shape of the message.
 *
 * Deliberately a cheap read of the text rather than a second parse: it runs for
 * every row of a virtualised timeline, and it only has to be right about the
 * shapes a whole message can take. Anything it is unsure of keeps its bubble,
 * which is never wrong, only plainer.
 */
export const isBareBlock = (text: string): boolean => {
  const lines = text.trim().split(/\r?\n/);
  const [first] = lines;
  if (!first) return false;

  // A quote that runs to the end of the message. A blank line would end it and
  // start something else, so every line has to carry the marker.
  if (lines.every((line) => line.startsWith('>'))) return true;

  const fence = ['```', '~~~'].find((marker) => first.startsWith(marker));
  if (!fence) return false;

  // The fence either closes on the last line or never closes; a fence that
  // closes earlier has a message written after it.
  const closesAt = lines.findIndex((line, index) => index > 0 && line.trimEnd().startsWith(fence));
  if (closesAt !== -1 && closesAt !== lines.length - 1) return false;

  // A fence with nothing in it is not rendered as a block at all — it is shown
  // as the text it is, and text belongs in a bubble like any other.
  const body = lines.slice(1, closesAt === -1 ? lines.length : closesAt);

  return `${first.slice(fence.length)}${body.join('')}`.trim().length > 0;
};
