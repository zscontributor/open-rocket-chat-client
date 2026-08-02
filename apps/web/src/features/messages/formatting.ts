/** The multi-line code fence, written by the toolbar and by hand alike. */
const FENCE = '```';

/**
 * The markup each formatting action writes.
 *
 * Chosen to match what `MessageBody` renders — GitHub-flavoured markdown —
 * because the composer's preview promises that what it shows is what the room
 * will show. `++underline++` is the one mark GFM has no concept of; it is
 * taught to the renderer by `makeRemarkUnderline`.
 */
export const MARKS = {
  bold: { open: '**', close: '**' },
  italic: { open: '_', close: '_' },
  strike: { open: '~~', close: '~~' },
  underline: { open: '++', close: '++' },
  code: { open: '`', close: '`' },
  // The fences go on lines of their own — a block whose code shares a line with
  // its opening fence is a language tag to every markdown parser there is, and
  // the code would be read as the name of a language nobody has heard of.
  codeBlock: { open: `${FENCE}\n`, close: `\n${FENCE}` },
} as const;

export type MarkName = keyof typeof MARKS;

/** The order the toolbar shows them in. */
export const MARK_ORDER: MarkName[] = ['bold', 'italic', 'underline', 'strike', 'code', 'codeBlock'];

export interface FormatResult {
  text: string;
  /** Where the selection should sit afterwards. */
  start: number;
  end: number;
}

/**
 * Closes a code block the moment its opening fence is typed.
 *
 * Rocket.Chat writes the closing fence for you, and it has to: with Enter set
 * to send, a fence opened by hand is a message sent before a single line of
 * code was written. Typing ``` and finding the caret waiting on a line between
 * two fences is the difference between a code block being something you type
 * and something you fight.
 *
 * Returns `null` unless the fence is alone on its line and leaves the message
 * with an odd number of them — that is what tells an opening fence from the
 * closing one the user is typing themselves, which must be left alone.
 */
export const closeCodeFence = (text: string, caret: number): FormatResult | null => {
  if (text.slice(caret - FENCE.length, caret) !== FENCE) return null;
  // A fourth backtick is somebody typing, not a fence being opened.
  if (text[caret - FENCE.length - 1] === '`') return null;

  const lineStart = text.lastIndexOf('\n', caret - FENCE.length - 1) + 1;
  if (text.slice(lineStart, caret - FENCE.length).trim().length > 0) return null;

  const lineEnd = text.indexOf('\n', caret);
  if (text.slice(caret, lineEnd === -1 ? text.length : lineEnd).trim().length > 0) return null;

  const fences = text.split('\n').filter((line) => line.trimStart().startsWith(FENCE)).length;
  if (fences % 2 === 0) return null;

  // The caret lands on the blank line between the two fences, which is where
  // the code goes.
  const position = caret + 1;

  return { text: `${text.slice(0, caret)}\n\n${FENCE}${text.slice(caret)}`, start: position, end: position };
};

/**
 * Wraps the selection in a mark, or unwraps it when it is already marked.
 *
 * Toggling is what makes the toolbar feel like a word processor rather than a
 * macro that only ever adds asterisks: pressing bold twice leaves the text as
 * it was found.
 *
 * The selection is trimmed before it is wrapped, because dragging across a word
 * almost always takes the space after it with it, and `** word **` is not
 * emphasis in any markdown flavour — it renders as literal asterisks.
 */
export const applyMark = (text: string, selectionStart: number, selectionEnd: number, name: MarkName): FormatResult => {
  const { open, close } = MARKS[name];

  const raw = text.slice(selectionStart, selectionEnd);
  const from = selectionStart + (raw.length - raw.trimStart().length);
  const to = Math.max(from, selectionEnd - (raw.length - raw.trimEnd().length));
  const selected = text.slice(from, to);

  // The marks were caught inside the selection — someone selected the whole of
  // `**word**`, delimiters and all.
  if (selected.length > open.length + close.length && selected.startsWith(open) && selected.endsWith(close)) {
    const inner = selected.slice(open.length, selected.length - close.length);

    return {
      text: `${text.slice(0, from)}${inner}${text.slice(to)}`,
      start: from,
      end: from + inner.length,
    };
  }

  // The marks sit just outside it, which is where they are left after this
  // function wraps a selection: pressing the same button again undoes it.
  if (text.slice(from - open.length, from) === open && text.slice(to, to + close.length) === close) {
    const start = from - open.length;

    return {
      text: `${text.slice(0, start)}${selected}${text.slice(to + close.length)}`,
      start,
      end: start + selected.length,
    };
  }

  return {
    // With nothing selected this writes the empty pair and the caret lands
    // between them, ready to type into.
    text: `${text.slice(0, from)}${open}${selected}${close}${text.slice(to)}`,
    start: from + open.length,
    end: from + open.length + selected.length,
  };
};
