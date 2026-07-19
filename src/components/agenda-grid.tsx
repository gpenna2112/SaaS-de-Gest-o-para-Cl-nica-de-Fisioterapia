import { AttendeeStatusActions } from "@/components/attendee-status-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AttendeeStatus } from "@/modules/scheduling/session-state-machine";
import type { SessionAttendeeView, SessionView } from "@/modules/scheduling/session-view";

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

const STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger"> = {
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
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
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

/** Participantes cancelados somem do card — a sessão continua ativa, só quem cancelou não aparece. */
function activeAttendeesOf(session: SessionView): SessionAttendeeView[] {
  return session.attendees.filter((attendee) => attendee.status !== "cancelada");
}

function AttendeeRow({ attendee }: { attendee: SessionAttendeeView }) {
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{attendee.patientName ?? "Paciente"}</span>
        <StatusBadge tone={STATUS_TONES[attendee.status] ?? "neutral"}>
          {STATUS_LABELS[attendee.status] ?? attendee.status}
        </StatusBadge>
      </div>
      <AttendeeStatusActions attendeeId={attendee.id} status={attendee.status as AttendeeStatus} />
    </li>
  );
}

export interface AgendaRoom {
  id: string;
  name: string;
}

/**
 * Grade por sala/horário — só a partir de `md:` pra cima. No mobile, N
 * colunas de sala lado a lado exigem rolagem horizontal, contrariando o
 * uso real (fisio olhando o celular entre sessões, não comparando salas).
 */
function AgendaRoomGrid({
  rooms,
  sessions,
  slotMinutes,
}: {
  rooms: AgendaRoom[];
  sessions: SessionView[];
  slotMinutes: number;
}) {
  const slotCount = Math.ceil((DAY_END_MINUTES - DAY_START_MINUTES) / slotMinutes);
  const slots = Array.from({ length: slotCount }, (_, index) => DAY_START_MINUTES + index * slotMinutes);

  return (
    <div className="hidden overflow-x-auto md:block">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `5rem repeat(${rooms.length}, minmax(10rem, 1fr))`,
          gridTemplateRows: `auto repeat(${slotCount}, 4rem)`,
        }}
      >
        <div className="border-b border-border p-2" style={{ gridColumn: 1, gridRow: 1 }} />
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
          const roomIndex = rooms.findIndex((room) => room.id === session.roomId);
          if (roomIndex === -1) {
            return null;
          }

          const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
          const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
          const slotIndex = Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes);
          const span = Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes));
          if (slotIndex < 0 || slotIndex >= slotCount) {
            return null;
          }

          return (
            <div
              key={session.id}
              className="m-1 overflow-hidden rounded-md bg-primary/10 p-2 text-xs"
              style={{ gridColumn: roomIndex + 2, gridRow: `${slotIndex + 2} / span ${span}` }}
            >
              <p className="font-medium">
                {formatTime(session.scheduledStart)}–{formatTime(session.scheduledEnd)}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {activeAttendeesOf(session).map((attendee) => (
                  <AttendeeRow key={attendee.id} attendee={attendee} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Lista cronológica — só abaixo de `md:`. Sem grade, sem rolagem
 * horizontal: sala aparece como texto simples em cada card.
 */
function AgendaDayList({ rooms, sessions }: { rooms: AgendaRoom[]; sessions: SessionView[] }) {
  const sortedSessions = [...sessions].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

  if (sortedSessions.length === 0) {
    return <p className="text-sm text-muted-foreground md:hidden">Nenhuma sessão neste dia.</p>;
  }

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {sortedSessions.map((session) => {
        const room = rooms.find((candidate) => candidate.id === session.roomId);
        return (
          <li key={session.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {formatTime(session.scheduledStart)}–{formatTime(session.scheduledEnd)}
              </p>
              <span className="text-sm text-muted-foreground">{room?.name ?? "Sala"}</span>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {activeAttendeesOf(session).map((attendee) => (
                <AttendeeRow key={attendee.id} attendee={attendee} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
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
    return <p className="text-sm text-muted-foreground">Nenhuma sala ativa cadastrada.</p>;
  }

  return (
    <>
      <AgendaDayList rooms={rooms} sessions={sessions} />
      <AgendaRoomGrid rooms={rooms} sessions={sessions} slotMinutes={slotMinutes} />
    </>
  );
}
