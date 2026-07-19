import type { HTMLAttributes } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-primary/10 text-primary",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-danger/10 text-danger",
};

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
};

export function StatusBadge({
  tone = "neutral",
  className = "",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}
