import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './avatar';
import { Button } from './button';
import { Icons } from './icon';
import { Input } from './input';
import { SwitchField } from './switch';

const meta = {
  title: 'Theme/Audit',
  parameters: {
    docs: {
      description: {
        component:
          'Every surface and content token on one page. Switch theme and colour scheme in the toolbar: anything that disappears, or that you have to squint at, is a token to fix. See docs/theming.md.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const Swatch = ({ label, className }: { label: string; className: string }) => (
  <div className="flex items-center gap-2">
    <span className={`border-line size-10 rounded-md border ${className}`} />
    <span className="text-content-muted text-xs">{label}</span>
  </div>
);

/**
 * The surfaces, side by side.
 *
 * These are the tokens most often left at a value that vanishes against its
 * neighbour — `highlight` over `app` in particular, which is what own messages
 * are drawn on.
 */
export const Surfaces: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Swatch label="app" className="bg-app" />
      <Swatch label="sidebar" className="bg-sidebar" />
      <Swatch label="panel" className="bg-panel" />
      <Swatch label="raised" className="bg-raised" />
      <Swatch label="sunken" className="bg-sunken" />
      <Swatch label="highlight" className="bg-highlight" />
      <Swatch label="selected" className="bg-selected" />
      <Swatch label="accent" className="bg-accent" />
    </div>
  ),
};

/** Text at every level, over each surface it is actually drawn on. */
export const Text: Story = {
  render: () => (
    <div className="space-y-3">
      {(
        [
          ['app', 'bg-app'],
          ['sidebar', 'bg-sidebar'],
          ['raised', 'bg-raised'],
          ['sunken', 'bg-sunken'],
          ['highlight', 'bg-highlight'],
        ] as const
      ).map(([label, background]) => (
        <div key={label} className={`border-line rounded-lg border p-3 ${background}`}>
          <p className="text-content text-sm font-medium">content.primary on surface.{label}</p>
          <p className="text-content-secondary text-sm">content.secondary — body copy</p>
          <p className="text-content-muted text-xs">content.muted — timestamps and hints</p>
          <a href="#top" className="text-link text-sm underline">
            content.link
          </a>
        </div>
      ))}
    </div>
  ),
};

/** Status colours, which have to stay distinguishable in both schemes. */
export const Status: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {(
        [
          ['online', 'bg-online'],
          ['away', 'bg-away'],
          ['busy', 'bg-busy'],
          ['offline', 'bg-offline'],
          ['danger', 'bg-danger'],
          ['warning', 'bg-warning'],
          ['success', 'bg-success'],
          ['info', 'bg-info'],
        ] as const
      ).map(([label, background]) => (
        <Swatch key={label} label={label} className={background} />
      ))}
    </div>
  ),
};

/**
 * Interactive controls, for checking the focus ring.
 *
 * Tab through them: `border.focus` has to be visible against every surface,
 * not just the one it was picked against.
 */
export const Controls: Story = {
  render: () => (
    <div className="max-w-sm space-y-4">
      <Input placeholder="Filter rooms" aria-label="Filter rooms" />
      <div className="flex gap-2">
        <Button variant="primary">Create</Button>
        <Button>Cancel</Button>
        <Button variant="ghost" size="icon" aria-label="More">
          <Icons.more size={18} />
        </Button>
      </div>
      <div className="border-line divide-line divide-y rounded-lg border px-3">
        <SwitchField
          id="audit-a"
          label="Read only"
          hint="Only owners can post."
          checked
          onCheckedChange={() => undefined}
        />
        <SwitchField id="audit-b" label="Encrypted" checked={false} onCheckedChange={() => undefined} />
      </div>
      <div className="flex items-center gap-3">
        <Avatar name="Emma Wilson" status="online" />
        <span className="text-sm">Emma Wilson</span>
      </div>
    </div>
  ),
};
