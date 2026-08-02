import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import rehypeHighlight from 'rehype-highlight';

/**
 * The languages a code block in a chat room is actually written in.
 *
 * Named one by one rather than taking highlight.js's `common` bundle: that one
 * carries every grammar it ships with into the first load of the app, and a
 * client that opens on a room nobody has pasted Perl into should not have paid
 * for Perl. Each grammar registers its own aliases, so ` ```js `, ` ```sh `,
 * ` ```yml ` and ` ```html ` all land on the right one without being listed.
 *
 * Adding one is a line — worth doing the moment a room's own language is
 * missing, since an unregistered language falls back to unhighlighted text
 * rather than to an error.
 */
/*
 * Registered once, at module load: `rehypeHighlight(options)` builds a fresh
 * highlighter out of every grammar it is given, and react-markdown makes its
 * processor per render — passing the plugin the ordinary way would rebuild the
 * whole registry for every message on screen.
 */
const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

/**
 * Grammars that are never guessed at, only obeyed when named.
 *
 * A block with no language on its fence has its language guessed, the way
 * Rocket.Chat does — with Enter set to send, ` ``` ` on its own is how a code
 * block gets typed, so a named language is the exception rather than the rule.
 * But guessing is scored on how much of the text a grammar can claim, and these
 * four claim almost anything: `id = 1` is a valid INI file, `--save-dev` is a
 * SQL comment, and a shell command is a passable CSS rule. Each one turned a
 * common paste into the wrong colours, which reads worse than no colours at
 * all — so they are left out of the guess and reachable only as ` ```sql `.
 */
const NOT_GUESSED = new Set(['css', 'ini', 'markdown', 'sql']);

const transform = rehypeHighlight({
  languages: LANGUAGES,
  detect: true,
  subset: Object.keys(LANGUAGES).filter((name) => !NOT_GUESSED.has(name)),
});

/** A rehype plugin that colours fenced code blocks, and only those. */
export const rehypeCodeHighlight = () => transform;
