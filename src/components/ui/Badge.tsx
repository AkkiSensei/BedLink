import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-medium rounded-full tabular-numbers select-none border",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--border-subtle)] text-[var(--text-muted)] border-[var(--border-app)]",
        primary: "bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]/20",
        success: "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20",
        critical: "bg-[var(--critical-soft)] text-[var(--critical)] border-[var(--critical)]/20",
        info: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/20",
        outline: "bg-transparent text-[var(--text-app)] border-[var(--border-app)]"
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm font-semibold"
      }
    },
    defaultVariants: {
      variant: "neutral",
      size: "md"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  className = "",
  variant,
  size,
  icon,
  children,
  ...props
}) => {
  return (
    <span className={badgeVariants({ variant, size, className })} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
