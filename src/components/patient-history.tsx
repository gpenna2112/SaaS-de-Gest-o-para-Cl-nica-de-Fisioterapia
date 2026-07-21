import { StatusBadge } from "@/components/ui/status-badge";
import { ATTENDEE_STATUS_LABELS, ATTENDEE_STATUS_TONES, type AttendeeStatus } from "@/modules/scheduling/session-state-machine";

export interface AttendanceHistoryItem {
  attendeeId: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  roomName: string;
  professionalName: string;
}

export interface EvolutionHistoryItem {
  id: string;
  content: string;
  createdAt: Date;
  professionalName: string;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Histórico do paciente (ADR-0019): sessões passadas + evoluções clínicas, ambos só leitura. */
export function PatientHistory({
  attendanceHistory,
  evolutions,
}: {
  attendanceHistory: AttendanceHistoryItem[];
  evolutions: EvolutionHistoryItem[];
}) {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Sessões</h2>
        {attendanceHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="flex flex-col divide-y divide-border">
              {attendanceHistory.map((item) => (
                <li key={item.attendeeId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{formatDateTime(item.scheduledStart)}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.roomName} · {item.professionalName}
                    </span>
                  </div>
                  <StatusBadge tone={ATTENDEE_STATUS_TONES[item.status as AttendeeStatus] ?? "neutral"}>
                    {ATTENDEE_STATUS_LABELS[item.status as AttendeeStatus] ?? item.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Evoluções</h2>
        {evolutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma evolução registrada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {evolutions.map((evolution) => (
              <li key={evolution.id} className="rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDateTime(evolution.createdAt)}</span>
                  <span>{evolution.professionalName}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{evolution.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
