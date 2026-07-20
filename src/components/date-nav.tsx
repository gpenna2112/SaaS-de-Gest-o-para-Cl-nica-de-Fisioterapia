import Link from "next/link";
import {
  addDaysToDateString,
  formatDateLongPtBr,
  todayInSaoPaulo,
} from "@/modules/scheduling/day-range";

export function DateNav({ date }: { date: string }) {
  const previous = addDaysToDateString(date, -1);
  const next = addDaysToDateString(date, 1);
  const today = todayInSaoPaulo();

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/agenda?date=${previous}`}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Anterior
      </Link>
      <Link
        href={`/agenda?date=${today}`}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Hoje
      </Link>
      <Link
        href={`/agenda?date=${next}`}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Próximo
      </Link>
      <span className="ml-2 text-sm text-muted-foreground">{formatDateLongPtBr(date)}</span>
    </div>
  );
}
