import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Icons } from './icon';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Send message' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'subtle', 'outline', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'icon', 'iconLg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Subtle: Story = { args: { variant: 'subtle' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete' } };
export const Disabled: Story = { args: { variant: 'primary', disabled: true } };

/**
 * Every variant at once. A theme that gets `accent.content` wrong shows up here
 * immediately: the label on the primary button becomes unreadable.
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="subtle">Subtle</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="primary" size="icon" aria-label="Send">
        <Icons.send size={18} />
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};
