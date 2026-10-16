import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-border bg-surface text-text hover:bg-border/40',
  ghost: 'text-text-muted hover:bg-border/40 hover:text-text',
  danger: 'border border-failed/40 bg-failed/10 text-failed hover:bg-failed/20',
};

const SIZES: Record<Size, string> = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
