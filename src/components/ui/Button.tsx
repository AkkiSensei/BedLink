import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] border rounded-[var(--radius-sm)]",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] border-transparent shadow-sm",
        secondary: "bg-[var(--bg-surface)] text-[var(--text-app)] hover:bg-[var(--border-subtle)] border-[var(--border-app)] shadow-sm",
        ghost: "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--border-subtle)] border-transparent",
        destructive: "bg-[var(--critical)] text-white hover:opacity-90 border-transparent shadow-sm",
        outline: "bg-transparent text-[var(--text-app)] hover:bg-[var(--primary-soft)] border-[var(--border-app)] hover:border-[var(--primary)]",
        soft: "bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--border-subtle)] border-transparent"
      },
      size: {
        sm: "h-9 px-3 text-sm gap-1.5",
        md: "h-11 px-4 text-base gap-2", // 44px minimum touch
        lg: "h-14 px-6 text-lg gap-2.5 font-semibold", // 56px
        xl: "h-18 px-8 text-xl gap-3 font-semibold", // 72px for nurse critical actions
        icon: "h-11 w-11 p-0 justify-center"
      },
      fullWidth: {
        true: "w-full",
        false: "w-auto"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant, size, fullWidth, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={buttonVariants({ variant, size, fullWidth, className })}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={size === 'xl' ? 24 : size === 'lg' ? 20 : 16} />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        
        <span>{children}</span>
        
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export const IconButton: React.FC<ButtonProps & { 'aria-label': string }> = ({
  size = 'md',
  children,
  className = "",
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 w-9 p-0',
    md: 'h-11 w-11 p-0',
    lg: 'h-14 w-14 p-0',
    xl: 'h-18 w-18 p-0',
    icon: 'h-11 w-11 p-0'
  };

  return (
    <Button
      size={size}
      className={`rounded-lg ${sizeClasses[size || 'md']} ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
};
