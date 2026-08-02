import * as RadixSwitch from '@radix-ui/react-switch';

import { cn } from '@/lib/cn';

export const Switch = ({
  id,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) => (
  <RadixSwitch.Root
    id={id}
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    className={cn(
      'data-[state=checked]:bg-accent data-[state=unchecked]:bg-line relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
      className,
    )}
  >
    <RadixSwitch.Thumb className="bg-panel block size-4 translate-x-0.5 rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-[1.125rem]" />
  </RadixSwitch.Root>
);

/** A switch with its label and explanation, as used throughout the drawer. */
export const SwitchField = ({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-start gap-3 py-2">
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="text-content-muted mt-0.5 text-xs">{hint}</p> : null}
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
  </div>
);
