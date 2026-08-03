import type { ChannelMention, Mention } from '@open-rocket-chat/client-sdk';
import { useMemo } from 'react';
import Markdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/cn';
import { remarkCodeFence } from './code-fence';
import { CUSTOM_EMOJI_CLASS, makeRemarkEmoji } from './emoji';
import { makeRemarkHighlight } from './highlight';
import { remarkLineBreaks } from './line-breaks';
import { MentionChip } from './mention-chip';
import { makeRemarkMentions, MENTION_CLASS, messageMentionResolver, type MentionKind } from './mentions';
import { makeRemarkUnderline } from './underline';
import { hasCodeBlock, useCodeHighlighter } from './use-code-highlight';
import { useEmojiIndex } from './use-emoji';

/**
 * Every formatting rule for message text, in one place.
 *
 * Kept as a constant rather than inline so the timeline and the composer's
 * preview cannot drift apart — the whole point of the preview is that what it
 * shows is what the room will show.
 *
 * `mark` is styled here rather than left to the browser: the default black on
 * yellow is close to right, but it is one flat pair for both colour schemes,
 * and on a dark panel it reads as a hole punched in the page. The two schemes
 * get a yellow each, in `styles.css` beside the syntax colours.
 */
const PROSE =
  '[&_a]:text-link [&_a]:underline [&_blockquote]:border-line [&_blockquote]:text-content-muted [&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:bg-sunken [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_mark]:bg-marked [&_mark]:text-marked-content [&_mark]:rounded-sm [&_mark]:px-0.5 [&_mark]:font-medium [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_pre]:bg-sunken [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-1 [&_td]:border-line [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border-line [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5';

/** Shared, so a body with no code block hands react-markdown the same empty list. */
const NO_REHYPE_PLUGINS: Options['rehypePlugins'] = [];

const isCustomEmoji = (className: string | undefined): boolean =>
  className?.split(' ').includes(CUSTOM_EMOJI_CLASS) ?? false;

const isMention = (className: string | undefined): boolean => className?.split(' ').includes(MENTION_CLASS) ?? false;

/**
 * Builds the component map for one body.
 *
 * A function rather than a constant because the mention spans need somewhere to
 * send a click, and that is the caller's to decide — a mention in the timeline
 * can open a room, one in a room's own topic has nowhere to go.
 */
const buildComponents = (onOpenRoom?: (roomId: string) => void): Components => ({
  // Links in a chat message always point somewhere else.
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  // Custom emoji arrive as images tagged by the remark transform; sizing them
  // in `em` keeps them on the text baseline wherever the body is rendered.
  img: ({ className, alt, ...props }) =>
    isCustomEmoji(className) ? (
      <img {...props} alt={alt} className="inline-block size-[1.35em] object-contain align-[-0.25em]" />
    ) : (
      <img {...props} alt={alt} className={cn('max-h-72 rounded-lg', className)} />
    ),
  /*
   * Mentions arrive as spans the transform tagged with what it resolved.
   *
   * Markdown produces no spans of its own — raw HTML is not parsed — so a span
   * reaching here without the tag can only have come from somewhere else, and
   * is passed through as the plain markup it is.
   */
  // `node` is the hast element react-markdown passes every component; it has no
  // part in what is rendered here, and is pulled out so it cannot reach the DOM.
  span: ({ className, children, node: _node, ...props }) => {
    if (!isMention(className)) return <span className={className}>{children}</span>;

    const attributes = props as Record<string, string | undefined>;

    return (
      <MentionChip
        kind={attributes['data-mention-kind'] as MentionKind}
        name={attributes['data-mention-name'] ?? ''}
        id={attributes['data-mention-id']}
        onOpenRoom={onOpenRoom}
      />
    );
  },
});

/**
 * Renders message text the way the room does: GitHub-flavoured markdown with
 * `:shortcode:` emoji, standard and custom alike, and mentions you can click.
 */
export const MessageBody = ({
  text,
  mentions,
  channels,
  assumeMentions,
  highlight,
  onOpenRoom,
  className,
}: {
  text: string;
  /**
   * What the server resolved when the message was posted, and the only thing
   * that turns a name into a mention: a body given neither list renders `@` and
   * `#` as the text they are, which is right for a room topic and for any
   * message whose mentions were never fetched.
   */
  mentions?: Mention[];
  channels?: ChannelMention[];
  /**
   * Marks every well-formed name without checking it. For the composer's
   * preview, where the message has not been posted and there is nothing to
   * check it against yet.
   */
  assumeMentions?: boolean;
  /**
   * Terms to mark wherever they appear, for a body shown as a search result.
   * Empty or absent everywhere else, which is every other place text is read
   * rather than scanned.
   */
  highlight?: readonly string[];
  onOpenRoom?: (roomId: string) => void;
  className?: string;
}) => {
  const resolve = useEmojiIndex();

  // Rebuilt when the emoji datasets land, so shortcodes that could not be
  // resolved on the first pass are re-parsed once they can be. Mentions run
  // first: they consume whole words, and neither transform is interested in
  // what the other produces. Line breaks run last, once nothing else is still
  // matching across a run of text.
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkCodeFence,
      makeRemarkUnderline,
      makeRemarkMentions(messageMentionResolver(mentions, channels, assumeMentions)),
      makeRemarkEmoji(resolve),
      // Between the transforms that match within a run of text and the one that
      // cuts those runs into lines — see the note on the plugin itself.
      ...(highlight && highlight.length > 0 ? [makeRemarkHighlight(highlight)] : []),
      remarkLineBreaks,
    ],
    [resolve, mentions, channels, assumeMentions, highlight],
  );

  // Fetched only for a body that has a block to colour, and only once per tab.
  const colourCode = useCodeHighlighter(hasCodeBlock(text));

  const rehypePlugins = useMemo(() => (colourCode ? [colourCode] : NO_REHYPE_PLUGINS), [colourCode]);

  const components = useMemo(() => buildComponents(onOpenRoom), [onOpenRoom]);

  return (
    <div className={cn(PROSE, className)}>
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </Markdown>
    </div>
  );
};
