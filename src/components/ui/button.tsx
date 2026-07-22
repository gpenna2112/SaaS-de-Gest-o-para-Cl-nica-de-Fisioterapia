import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-muted text-foreground hover:opacity-90",
  danger: "bg-danger text-white hover:opacity-90",
};

/**
 * Mesma aparência do `Button` em qualquer elemento — usado por `LinkButton`
 * para um link navegar com a cara de botão, sem duplicar as classes.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  return `rounded-md px-4 py-2 text-sm font-medium transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
