import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './avatar';

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  args: { name: 'Emma Wilson' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

/** A broken image URL must fall back to initials, not an empty box. */
export const BrokenImage: Story = { args: { src: '/does-not-exist.png' } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Avatar key={size} name="Emma Wilson" size={size} />
      ))}
    </div>
  ),
};

/** The status ring is drawn in the surface colour, so it needs checking per theme. */
export const Presence: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {(['online', 'away', 'busy', 'offline'] as const).map((status) => (
        <Avatar key={status} name={status} size="lg" status={status} />
      ))}
    </div>
  ),
};

/** Tints are derived from the name, so the same person keeps the same colour. */
export const Tints: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['Emma Wilson', 'Liam Johnson', 'Olivia Brown', 'Noah Davis', 'Anh Nguyen', 'Quy Le'].map((name) => (
        <Avatar key={name} name={name} size="lg" />
      ))}
    </div>
  ),
};
