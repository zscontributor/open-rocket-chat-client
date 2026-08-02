import { useQuery } from '@tanstack/react-query';

/**
 * Whether a body has a fenced block in it at all.
 *
 * Inline code is deliberately not counted: `rehype-highlight` only ever touches
 * a `<code>` inside a `<pre>`, so a sentence with a backticked word in it has
 * nothing to colour and no reason to pull the grammars down.
 */
export const hasCodeBlock = (text: string): boolean => text.includes('```') || text.includes('~~~');

/**
 * The syntax highlighter, loaded the first time a code block is on screen.
 *
 * Two dozen grammars are a sixth of the application bundle, and most sessions
 * scroll past no code at all — so they are imported dynamically, exactly as the
 * emoji datasets are, and the block they were fetched for colours in a moment
 * after it appears. Cached forever once loaded: it is code, not data, and it
 * cannot go stale within a release.
 */
export const useCodeHighlighter = (enabled: boolean) => {
  const { data } = useQuery({
    queryKey: ['code-highlight'],
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () => import('./code-highlight').then((module) => module.rehypeCodeHighlight),
  });

  return data ?? null;
};
