import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardSnapshot } from "@/modules/scheduling/dashboard-view";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-foreground">{children}</h2>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function DashboardView({ snapshot, dateLabel }: { snapshot: DashboardSnapshot; dateLabel: string }) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm font-semibold text-muted-foreground">{dateLabel}</p>
      </div>

      <div className="flex flex-wrap gap-2">
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
              <li key={entry.roomId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="font-semibold">{entry.roomName}</span>
                  <span className="text-muted-foreground">{entry.professionalName}</span>
                  <span className="font-medium">{entry.patientNames.join(", ")}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">até {entry.until}</span>
              </li>
            ))}
            {snapshot.freeRoomsNow.map((entry) => (
              <li key={entry.roomId} className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                <span className="font-semibold">{entry.roomName}</span>
                <span>— livre agora</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <SectionTitle>Próximas sessões</SectionTitle>
          {snapshot.upcomingSessions.length === 0 ? (
            <EmptyState>Sem mais sessões hoje.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {snapshot.upcomingSessions.map((entry) => (
                <li key={entry.sessionId} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span className="font-semibold">
                    {entry.time} · {entry.roomName} · {entry.professionalName}
                  </span>
                  <span className="text-muted-foreground">{entry.patientNames.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <SectionTitle>Próximo horário livre</SectionTitle>
          {snapshot.nextFreeSlotByRoom.length === 0 ? (
            <EmptyState>Nenhuma sala cadastrada.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {snapshot.nextFreeSlotByRoom.map((entry) => (
                <li key={entry.roomId} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-semibold">{entry.roomName}</span>
                  <span className="text-muted-foreground">
                    {entry.time ? entry.time : "sem horário livre hoje"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Aguardando confirmação ({snapshot.awaitingConfirmation.length})</SectionTitle>
        {snapshot.awaitingConfirmation.length === 0 ? (
          <EmptyState>Ninguém aguardando confirmação hoje.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {snapshot.awaitingConfirmation.map((entry) => (
              <li key={entry.attendeeId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-semibold">{entry.time}</span> · {entry.roomName} · {entry.professionalName} ·{" "}
                  <span className="font-medium">{entry.patientName}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link href="/agenda" className="self-start text-sm font-medium text-primary hover:underline">
        Ver agenda completa →
      </Link>
    </div>
  );
}
