import { describe, expect, it } from 'vitest';

import { applyMark, closeCodeFence, type MarkName } from '../formatting';

/** `[` and `]` stand in for the selection, so the cases read as what a user did. */
const run = (marked: string, mark: MarkName) => {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  const text = marked.replace(/[[\]]/g, '');
  const result = applyMark(text, start, end, mark);

  return {
    text: result.text,
    selection: `${result.text.slice(0, result.start)}[${result.text.slice(result.start, result.end)}]${result.text.slice(result.end)}`,
  };
};

describe('applyMark', () => {
  it('wraps the selection in the mark', () => {
    expect(run('say [hello] there', 'bold').text).toBe('say **hello** there');
    expect(run('say [hello] there', 'italic').text).toBe('say _hello_ there');
    expect(run('say [hello] there', 'strike').text).toBe('say ~~hello~~ there');
    expect(run('say [hello] there', 'underline').text).toBe('say ++hello++ there');
    expect(run('say [hello] there', 'code').text).toBe('say `hello` there');
  });

  it('keeps the same words selected, so marks can be stacked', () => {
    expect(run('say [hello] there', 'bold').selection).toBe('say **[hello]** there');
  });

  it('unwraps a selection it had just wrapped', () => {
    // The marks land outside the selection, which is the state the first press
    // leaves behind — pressing again has to find them there.
    expect(run('say **[hello]** there', 'bold').text).toBe('say hello there');
  });

  it('unwraps when the marks were selected along with the text', () => {
    expect(run('say [**hello**] there', 'bold').text).toBe('say hello there');
  });

  it('leaves the whitespace around a selection outside the mark', () => {
    // Dragging across a word almost always takes the trailing space with it,
    // and `** hello **` is not emphasis — it renders as literal asterisks.
    expect(run('say [hello ]there', 'bold').text).toBe('say **hello** there');
    expect(run('say[ hello ]there', 'bold').text).toBe('say **hello** there');
  });

  it('writes an empty pair with the caret between them', () => {
    const result = applyMark('say ', 4, 4, 'bold');

    expect(result.text).toBe('say ****');
    expect(result.start).toBe(6);
    expect(result.end).toBe(6);
  });

  it('removes an empty pair the caret is sitting inside', () => {
    const result = applyMark('say ****', 6, 6, 'bold');

    expect(result.text).toBe('say ');
    expect(result.start).toBe(4);
  });

  it('does not mistake a shorter mark for a longer one', () => {
    // `~~` inside a selection of exactly the delimiters is not a wrapped run.
    expect(applyMark('~~~~', 0, 4, 'strike').text).toBe('~~~~~~~~');
  });

  it('treats bold and italic as independent, not as one nested mark', () => {
    const bolded = applyMark('hello', 0, 5, 'bold');
    const both = applyMark(bolded.text, bolded.start, bolded.end, 'italic');

    expect(both.text).toBe('**_hello_**');
    expect(both.text.slice(both.start, both.end)).toBe('hello');
  });
});

describe('closeCodeFence', () => {
  /** What the box holds after the third backtick of `text` was typed. */
  const typed = (text: string) => closeCodeFence(text, text.indexOf('```') + 3);

  it('writes the closing fence and waits on the line between them', () => {
    const result = closeCodeFence('```', 3);

    expect(result?.text).toBe('```\n\n```');
    // On the blank middle line, which is where the code goes.
    expect(result?.start).toBe(4);
    expect(result?.end).toBe(4);
  });

  it('closes a fence opened under a message already being written', () => {
    expect(typed('look at this:\n```')?.text).toBe('look at this:\n```\n\n```');
  });

  it('leaves the closing fence the user types themselves alone', () => {
    // Two fences balance, so this third one is closing the block, not opening.
    expect(closeCodeFence('```\ncode\n```', 12)).toBeNull();
  });

  it('only fires on a fence that has its own line', () => {
    expect(closeCodeFence('run ```', 7)).toBeNull();
    expect(closeCodeFence('```npm i', 3)).toBeNull();
  });

  it('ignores a fourth backtick and anything shorter than three', () => {
    expect(closeCodeFence('````', 4)).toBeNull();
    expect(closeCodeFence('``', 2)).toBeNull();
  });
});

describe('the code block mark', () => {
  it('writes the fences on lines of their own, with the caret between them', () => {
    const result = applyMark('', 0, 0, 'codeBlock');

    expect(result.text).toBe('```\n\n```');
    expect(result.start).toBe(4);
    expect(result.end).toBe(4);
  });

  it('wraps a selection without eating the line it was on', () => {
    const result = applyMark('look: const a = 1;', 6, 18, 'codeBlock');

    expect(result.text).toBe('look: ```\nconst a = 1;\n```');
    expect(result.text.slice(result.start, result.end)).toBe('const a = 1;');
  });

  it('unwraps a block it already wrote', () => {
    const wrapped = applyMark('const a = 1;', 0, 12, 'codeBlock');
    const undone = applyMark(wrapped.text, wrapped.start, wrapped.end, 'codeBlock');

    expect(undone.text).toBe('const a = 1;');
  });

  it('leaves the fence line free of the code, so it is not read as a language', () => {
    // ```const a = 1; would make `const` the block's language and hide it.
    expect(applyMark('const a = 1;', 0, 12, 'codeBlock').text.split('\n')[0]).toBe('```');
  });
});
