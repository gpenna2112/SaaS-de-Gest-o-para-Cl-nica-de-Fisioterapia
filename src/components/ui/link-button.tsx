import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClassName, type ButtonVariant } from "@/components/ui/button";

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

/** `Link` com a mesma aparência do `Button` — para ações de navegação (ex.: "Nova sessão"), não de submissão. */
export function LinkButton({ variant = "primary", className = "", ...props }: LinkButtonProps) {
  return <Link className={buttonClassName(variant, className)} {...props} />;
}
