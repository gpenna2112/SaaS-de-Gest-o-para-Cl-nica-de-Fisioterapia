import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardSnapshot } from "@/modules/scheduling/dashboard-view";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-foreground">{children}</h2>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function DashboardView({
  snapshot,
  dateLabel,
  date,
  greeting,
}: {
  snapshot: DashboardSnapshot;
  dateLabel: string;
  date: string;
  greeting: string;
}) {
  const agendaHref = `/agenda?date=${date}`;
  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">{greeting}</h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            Hoje você tem <strong className="font-bold text-foreground">{snapshot.sessionsCount} sessões</strong>{" "}
            agendadas na clínica.
          </p>
        </div>
        <p className="text-right text-sm font-semibold text-muted-foreground">{dateLabel}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard tone="primary" value={snapshot.sessionsCount} label="Sessões hoje" />
        <StatCard tone="primary" value={snapshot.realizedCount} label="Realizadas" />
        <StatCard tone="danger" value={snapshot.missedCount} label="Faltas" />
        <StatCard tone="warning" value={snapshot.cancelledCount} label="Canceladas" />
      </div>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Atendendo agora</SectionTitle>
        {snapshot.attendingNow.length === 0 && snapshot.freeRoomsNow.length === 0 ? (
          <EmptyState>Nenhuma sala cadastrada.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {snapshot.attendingNow.map((entry) => (
              <li key={entry.roomId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="font-bold">{entry.roomName}</span>
                  <span className="text-muted-foreground">{entry.professionalName}</span>
                  <span className="font-semibold">{entry.patientNames.join(", ")}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">até {entry.until}</span>
              </li>
            ))}
            {snapshot.freeRoomsNow.map((entry) => (
              <li key={entry.roomId} className="flex items-center gap-2 py-2.5 text-sm text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                <span className="font-bold">{entry.roomName}</span>
                <span>— livre agora</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-coral-200 bg-coral-50 p-5">
          <div className="flex items-center gap-2.5">
            <SectionTitle>
              <span className="text-coral-700">Aguardando confirmação</span>
            </SectionTitle>
            <span className="rounded-full bg-coral-600 px-2.5 py-0.5 text-xs font-bold text-white">
              {snapshot.awaitingConfirmation.length}
            </span>
          </div>
          {snapshot.awaitingConfirmation.length === 0 ? (
            <p className="text-sm text-coral-700">Ninguém aguardando confirmação hoje.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-coral-200">
              {snapshot.awaitingConfirmation.map((entry) => (
                <li key={entry.attendeeId}>
                  <Link
                    href={agendaHref}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:opacity-75"
                  >
                    <span>
                      <strong className="font-bold">{entry.time}</strong> · {entry.roomName} ·{" "}
                      {entry.professionalName} · <span className="font-semibold">{entry.patientName}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-coral-700">Abrir →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Próximas sessões</SectionTitle>
            <Link href={agendaHref} className="text-xs font-bold text-primary hover:opacity-80">
              Ver agenda completa →
            </Link>
          </div>
          {snapshot.upcomingSessions.length === 0 ? (
            <EmptyState>Sem mais sessões hoje.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {snapshot.upcomingSessions.map((entry) => (
                <li key={entry.sessionId}>
                  <Link
                    href={agendaHref}
                    className="flex flex-col gap-0.5 rounded-md py-2.5 text-sm hover:bg-muted"
                  >
                    <span className="font-bold">
                      {entry.time} · {entry.roomName} · {entry.professionalName}
                    </span>
                    <span className="text-muted-foreground">{entry.patientNames.join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Próximo horário livre por sala</SectionTitle>
        {snapshot.nextFreeSlotByRoom.length === 0 ? (
          <EmptyState>Nenhuma sala cadastrada.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {snapshot.nextFreeSlotByRoom.map((entry) => (
              <div key={entry.roomId} className="rounded-xl border border-border px-3.5 py-3">
                <div className="text-sm font-bold">{entry.roomName}</div>
                <div className="mt-0.5 font-mono text-sm text-muted-foreground">
                  {entry.time ? entry.time : "sem horário livre hoje"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Ações rápidas</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LinkButton href={agendaHref} variant="primary" className="block w-full text-center">
            + Nova sessão
          </LinkButton>
          <LinkButton href="/pacientes/novo" variant="secondary" className="block w-full text-center">
            Novo paciente
          </LinkButton>
          <LinkButton href="/agenda" variant="secondary" className="block w-full text-center">
            Abrir agenda
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
