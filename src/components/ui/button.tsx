import type { ComponentProps } from "react";

const variants = {
  primary: "border-transparent bg-accent text-on-accent not-disabled:hover:bg-accent-hover",
  secondary: "border-border bg-transparent text-foreground not-disabled:hover:bg-surface-muted",
  ghost: "border-transparent bg-transparent text-muted not-disabled:hover:bg-surface-hover",
  danger: "border-danger-border bg-transparent text-danger not-disabled:hover:bg-danger-bg",
  link: "border-transparent bg-transparent text-accent not-disabled:hover:underline",
  "danger-link": "border-transparent bg-transparent text-danger not-disabled:hover:underline",
} as const;

const sizes = {
  default: "min-h-11 px-4 text-sm",
  sm: "min-h-11 px-2 text-xs",
  icon: "size-11 shrink-0 p-0 text-sm",
} as const;

type ButtonStyleProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
};

/** Share the same appearance with links and native file-input labels. */
export function buttonStyles({ variant = "secondary", size = "default", className = "" }: ButtonStyleProps = {}) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg border font-sans font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  ].filter(Boolean).join(" ");
}

export type ButtonProps = ComponentProps<"button"> & ButtonStyleProps;

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button className={buttonStyles({ variant, size, className })} type={type} {...props} />;
}
