import { StatusBadge } from "@/components/ui/status-badge";
import type { SessionView } from "@/modules/scheduling/session-view";

// Simplificação deliberada: horário de funcionamento fixo (07h–20h), não
// configurável por clínica ainda. Sessões fora dessa janela não aparecem.
const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 20 * 60;

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  falta: "Falta",
  cancelada: "Cancelada",
};

const STATUS_TONES: Record<
  string,
  "neutral" | "success" | "warning" | "danger"
> = {
  agendada: "neutral",
  confirmada: "success",
  realizada: "success",
  falta: "danger",
  cancelada: "neutral",
};

function minutesSinceMidnightSaoPaulo(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return hour * 60 + minute;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSlotLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface AgendaRoom {
  id: string;
  name: string;
}

export function AgendaGrid({
  rooms,
  sessions,
  slotMinutes,
}: {
  rooms: AgendaRoom[];
  sessions: SessionView[];
  slotMinutes: number;
}) {
  if (rooms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma sala ativa cadastrada.
      </p>
    );
  }

  const slotCount = Math.ceil(
    (DAY_END_MINUTES - DAY_START_MINUTES) / slotMinutes,
  );
  const slots = Array.from(
    { length: slotCount },
    (_, index) => DAY_START_MINUTES + index * slotMinutes,
  );

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `5rem repeat(${rooms.length}, minmax(10rem, 1fr))`,
          gridTemplateRows: `auto repeat(${slotCount}, 4rem)`,
        }}
      >
        <div
          className="border-b border-border p-2"
          style={{ gridColumn: 1, gridRow: 1 }}
        />
        {rooms.map((room, roomIndex) => (
          <div
            key={room.id}
            className="border-b border-border p-2 text-sm font-medium"
            style={{ gridColumn: roomIndex + 2, gridRow: 1 }}
          >
            {room.name}
          </div>
        ))}

        {slots.map((slotMinute, slotIndex) => (
          <div
            key={slotMinute}
            className="border-b border-border p-2 text-xs text-muted-foreground"
            style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
          >
            {formatSlotLabel(slotMinute)}
          </div>
        ))}

        {sessions.map((session) => {
          const roomIndex = rooms.findIndex(
            (room) => room.id === session.roomId,
          );
          if (roomIndex === -1) {
            return null;
          }

          const startMinutes = minutesSinceMidnightSaoPaulo(
            session.scheduledStart,
          );
          const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
          const slotIndex = Math.floor(
            (startMinutes - DAY_START_MINUTES) / slotMinutes,
          );
          const span = Math.max(
            1,
            Math.ceil((endMinutes - startMinutes) / slotMinutes),
          );
          if (slotIndex < 0 || slotIndex >= slotCount) {
            return null;
          }

          const activeAttendees = session.attendees.filter(
            (attendee) => attendee.status !== "cancelada",
          );

          return (
            <div
              key={session.id}
              className="m-1 overflow-hidden rounded-md bg-primary/10 p-2 text-xs"
              style={{
                gridColumn: roomIndex + 2,
                gridRow: `${slotIndex + 2} / span ${span}`,
              }}
            >
              <p className="font-medium">
                {formatTime(session.scheduledStart)}–
                {formatTime(session.scheduledEnd)}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {activeAttendees.map((attendee) => (
                  <li
                    key={attendee.id}
                    className="flex items-center justify-between gap-1"
                  >
                    <span className="truncate">
                      {attendee.patientName ?? "Paciente"}
                    </span>
                    <StatusBadge
                      tone={STATUS_TONES[attendee.status] ?? "neutral"}
                    >
                      {STATUS_LABELS[attendee.status] ?? attendee.status}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
