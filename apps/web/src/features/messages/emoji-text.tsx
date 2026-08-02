import { cn } from '@/lib/cn';
import { bareShortcode } from './emoji';
import { useEmojiIndex } from './use-emoji';

/**
 * A single Rocket.Chat shortcode, rendered as the emoji it stands for.
 *
 * Custom emoji become images and standard ones their Unicode character, over
 * the same resolver message bodies use. Anything unresolved stays as the
 * shortcode — which is also what shows while the datasets are still loading,
 * rather than a blank where a reaction should be.
 */
export const EmojiText = ({ shortcode, className }: { shortcode: string; className?: string }) => {
  const resolve = useEmojiIndex();

  const name = bareShortcode(shortcode);
  const emoji = resolve(name);

  if (emoji?.kind === 'custom') {
    return (
      <img
        src={emoji.url}
        alt={`:${name}:`}
        title={`:${name}:`}
        loading="lazy"
        className={cn('inline-block size-[1.35em] object-contain align-[-0.25em]', className)}
      />
    );
  }

  return <span className={className}>{emoji?.character ?? `:${name}:`}</span>;
};
