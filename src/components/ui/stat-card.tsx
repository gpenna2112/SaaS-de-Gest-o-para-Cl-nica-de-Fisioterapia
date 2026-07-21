const toneClasses = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger/10 text-danger",
  info: "bg-coral-50 text-coral-700",
} as const;

export type StatCardTone = keyof typeof toneClasses;

export function StatCard({ tone, value, label }: { tone: StatCardTone; value: number; label: string }) {
  return (
    <div
      className={`flex min-w-[6.5rem] flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2 sm:flex-none ${toneClasses[tone]}`}
    >
      <span className="text-lg font-bold leading-tight">{value}</span>
      <span className="text-[11px] font-medium opacity-80">{label}</span>
    </div>
  );
}
