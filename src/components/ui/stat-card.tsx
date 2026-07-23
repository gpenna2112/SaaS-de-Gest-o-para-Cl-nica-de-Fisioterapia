const toneClasses = {
  primary: "text-primary",
  warning: "text-warning-foreground",
  danger: "text-danger",
  neutral: "text-foreground",
} as const;

export type StatCardTone = keyof typeof toneClasses;

export function StatCard({
  tone,
  value,
  label,
  className = "",
}: {
  tone: StatCardTone;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-[6.5rem] flex-1 flex-col items-start gap-0.5 rounded-2xl border border-border bg-background px-4 py-3 shadow-xs sm:flex-none ${className}`}
    >
      <span className={`text-2xl font-extrabold leading-tight ${toneClasses[tone]}`}>{value}</span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
