"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { SessionPanel, type PanelState, type ProfessionalOption } from "@/components/session-panel";
import { patch, post } from "@/lib/api-client";
import {
  addDaysToDateString,
  combineDateAndTimeInSaoPaulo,
  formatDateLongPtBr,
  getMondayOfWeek,
} from "@/modules/scheduling/day-range";
import { isValidStatusTransition, type AttendeeStatus } from "@/modules/scheduling/session-state-machine";
import type { SessionView } from "@/modules/scheduling/session-view";
import type { PatientOption } from "@/components/patient-multiselect";

const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 20 * 60;
const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  agendada: "neutral",
  confirmada: "success",
  realizada: "success",
  falta: "danger",
  cancelada: "neutral",
};
const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  falta: "Falta",
  cancelada: "Cancelada",
};

export interface AgendaRoom {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

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
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
}
function formatSlotLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function AgendaView({
  date,
  rooms,
  sessions,
  slotMinutes,
  professionals,
  patients,
  currentProfessionalId,
}: {
  date: string;
  rooms: AgendaRoom[];
  sessions: SessionView[];
  slotMinutes: number;
  professionals: ProfessionalOption[];
  patients: PatientOption[];
  currentProfessionalId?: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<
    { mode: "create"; roomId: string; hour: number } | { mode: "edit"; sessionId: string; roomId: string } | null
  >(null);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? "");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const slotCount = Math.ceil((DAY_END_MINUTES - DAY_START_MINUTES) / slotMinutes);
  const slots = Array.from({ length: slotCount }, (_, index) => DAY_START_MINUTES + index * slotMinutes);

  const monday = getMondayOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const d = addDaysToDateString(monday, index);
    return { date: d, label: DAY_LABELS[index], dayLabel: d.slice(8, 10) + "/" + d.slice(5, 7), selected: d === date };
  });
  const prevWeek = addDaysToDateString(monday, -7);
  const nextWeek = addDaysToDateString(monday, 7);
  const weekEnd = addDaysToDateString(monday, 6);
  const weekEndMonthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(`${weekEnd}T12:00:00-03:00`))
    .replace(".", "");

  const nowMinutes = minutesSinceMidnightSaoPaulo(now);
  const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now);
  const showNowLine = date === todayStr && nowMinutes >= DAY_START_MINUTES && nowMinutes <= DAY_END_MINUTES;

  const occupiedByRoom = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const session of sessions) {
      const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
      const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
      const startIndex = Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes);
      const span = Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes));
      const occupied = map.get(session.roomId) ?? new Set<number>();
      for (let i = startIndex; i < startIndex + span; i++) occupied.add(i);
      map.set(session.roomId, occupied);
    }
    return map;
  }, [sessions, slotMinutes]);

  /**
   * Sessão que *começa* neste slot — por índice de slot (não igualdade
   * exata de minuto), porque o horário real de uma sessão nem sempre cai
   * exatamente num múltiplo de `slotMinutes` a partir de 07:00 (a duração
   * padrão pode mudar, ou a sessão foi criada com horário livre).
   */
  function findSession(roomId: string, slotMinute: number) {
    const slotIndex = (slotMinute - DAY_START_MINUTES) / slotMinutes;
    return sessions.find((session) => {
      if (session.roomId !== roomId) return false;
      const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
      return Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes) === slotIndex;
    });
  }

  async function withRefresh(action: () => Promise<unknown>) {
    await action();
    router.refresh();
  }

  async function handleCreate({ professionalId, patientIds }: { professionalId: string; patientIds: string[] }) {
    if (panel?.mode !== "create") return;
    const label = formatSlotLabel(panel.hour);
    const endLabel = formatSlotLabel(panel.hour + slotMinutes);
    await withRefresh(async () => {
      await post("/api/v1/sessions", {
        professionalId,
        roomId: panel.roomId,
        scheduledStart: combineDateAndTimeInSaoPaulo(date, label),
        scheduledEnd: combineDateAndTimeInSaoPaulo(date, endLabel),
        patientIds,
      });
    });
    setPanel(null);
  }

  async function handleSetAttendeeStatus(attendeeId: string, status: AttendeeStatus) {
    await withRefresh(() => patch(`/api/v1/session-attendees/${attendeeId}`, { status }));
  }

  async function handleAddPatient(patientId: string) {
    if (panel?.mode !== "edit") return;
    await withRefresh(() => post(`/api/v1/sessions/${panel.sessionId}/attendees`, { patientId }));
  }

  async function handleDeleteSession(session: SessionView) {
    // Só cancela quem ainda permite a transição (agendada/confirmada) — um
    // attendee já realizada/falta é registro histórico permanente (ADR-0010),
    // "excluir" não desfaz o que já aconteceu.
    const cancellable = session.attendees.filter((attendee) =>
      isValidStatusTransition(attendee.status as AttendeeStatus, "cancelada"),
    );
    await withRefresh(async () => {
      for (const attendee of cancellable) {
        await patch(`/api/v1/session-attendees/${attendee.id}`, { status: "cancelada" });
      }
    });
    setPanel(null);
  }

  const editingSession = panel?.mode === "edit" ? (sessions.find((s) => s.id === panel.sessionId) ?? null) : null;

  function roomOf(roomId: string) {
    return rooms.find((room) => room.id === roomId)!;
  }

  function panelStateFor(): PanelState | null {
    if (!panel) return null;
    const room = roomOf(panel.roomId);
    if (panel.mode === "create") {
      const label = formatSlotLabel(panel.hour);
      const endLabel = formatSlotLabel(panel.hour + slotMinutes);
      const dayIndex = weekDays.findIndex((d) => d.selected);
      return {
        mode: "create",
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
        roomCapacity: room.capacity,
        hourLabel: label,
        dayHourLabel: `${DAY_LABELS[dayIndex] ?? ""} · ${label}–${endLabel}`,
      };
    }
    if (!editingSession) return null;
    const professional = professionals.find((p) => p.id === editingSession.professionalId);
    return {
      mode: "edit",
      session: editingSession,
      roomId: room.id,
      roomName: room.name,
      roomType: room.type,
      roomCapacity: room.capacity,
      professionalName: professional?.name ?? "—",
      dayHourLabel: `${formatTime(editingSession.scheduledStart)}–${formatTime(editingSession.scheduledEnd)}`,
    };
  }

  function SessionCard({ session, compact }: { session: SessionView; compact?: boolean }) {
    const active = session.attendees.filter((attendee) => attendee.status !== "cancelada");
    return (
      <button
        type="button"
        onClick={() => setPanel({ mode: "edit", sessionId: session.id, roomId: session.roomId })}
        className={`z-10 flex flex-col gap-1 rounded-md bg-primary/10 p-2 text-left text-xs ${
          compact ? "h-full w-full" : "absolute inset-x-1 top-1"
        }`}
      >
        {!compact ? (
          <span className="font-semibold text-muted-foreground">
            {formatTime(session.scheduledStart)}–{formatTime(session.scheduledEnd)}
          </span>
        ) : null}
        {active.map((attendee) => (
          <span key={attendee.id} className="flex items-center justify-between gap-1">
            <span className="truncate font-medium">{attendee.patientName ?? "Paciente"}</span>
            <StatusBadge tone={STATUS_TONES[attendee.status] ?? "neutral"} className="shrink-0">
              {STATUS_LABELS[attendee.status] ?? attendee.status}
            </StatusBadge>
          </span>
        ))}
      </button>
    );
  }

  function EmptySlot({ roomId, hour }: { roomId: string; hour: number }) {
    const label = formatSlotLabel(hour);
    const endLabel = formatSlotLabel(hour + slotMinutes);
    return (
      <button
        type="button"
        onClick={() => setPanel({ mode: "create", roomId, hour })}
        aria-label={`Nova sessão às ${label}–${endLabel}`}
        className="group flex h-full w-full items-center justify-center rounded-md border border-dashed border-input-border text-muted-foreground/70 hover:bg-muted hover:text-foreground"
      >
        <span className="text-lg font-extralight group-hover:hidden">+</span>
        <span className="hidden text-[11px] group-hover:inline">
          + {label}–{endLabel}
        </span>
      </button>
    );
  }

  const mobileRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Agenda</h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/agenda?date=${prevWeek}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-input-border text-sm hover:bg-muted">
            ‹
          </Link>
          <span className="min-w-[110px] text-sm font-semibold">
            {monday.slice(8, 10)}–{weekEnd.slice(8, 10)} {weekEndMonthLabel}
          </span>
          <Link href={`/agenda?date=${nextWeek}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-input-border text-sm hover:bg-muted">
            ›
          </Link>
        </div>
        <Link href={`/agenda?date=${new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date())}`} className="rounded-md border border-input-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          Hoje
        </Link>
      </div>

      <div className="flex gap-1.5">
        {weekDays.map((day) => (
          <Link
            key={day.date}
            href={`/agenda?date=${day.date}`}
            className={`flex w-14 flex-col items-center justify-center rounded-lg py-1.5 ${
              day.selected ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"
            }`}
          >
            <span className="text-[10px] opacity-75">{day.label}</span>
            <span className="text-sm font-bold">{day.dayLabel}</span>
          </Link>
        ))}
      </div>

      <p className="text-sm font-semibold text-muted-foreground">{formatDateLongPtBr(date)}</p>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sala ativa cadastrada.</p>
      ) : (
        <>
          {/* Desktop: grade por sala */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
            <div
              className="relative grid min-w-max"
              style={{
                gridTemplateColumns: `4.5rem repeat(${rooms.length}, minmax(11rem, 1fr))`,
                gridTemplateRows: `2.75rem repeat(${slotCount}, 4.5rem)`,
              }}
            >
              <div className="border-b border-border bg-muted/40" style={{ gridColumn: 1, gridRow: 1 }} />
              {rooms.map((room, roomIndex) => (
                <div
                  key={room.id}
                  className="flex items-center justify-center gap-1.5 border-b border-border bg-muted/40 text-sm font-semibold"
                  style={{ gridColumn: roomIndex + 2, gridRow: 1 }}
                >
                  {room.name}
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {room.capacity}
                  </span>
                </div>
              ))}

              {slots.map((slotMinute, slotIndex) => (
                <div
                  key={slotMinute}
                  className="border-b border-border p-1.5 pt-1 text-[11px] text-muted-foreground"
                  style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
                >
                  {formatSlotLabel(slotMinute)}
                </div>
              ))}

              {rooms.map((room, roomIndex) =>
                slots.map((slotMinute, slotIndex) => (
                  <div
                    key={`${room.id}-${slotMinute}`}
                    className="border-b border-border p-1"
                    style={{ gridColumn: roomIndex + 2, gridRow: slotIndex + 2 }}
                  >
                    {occupiedByRoom.get(room.id)?.has(slotIndex) ? null : (
                      <EmptySlot roomId={room.id} hour={slotMinute} />
                    )}
                  </div>
                )),
              )}

              {sessions.map((session) => {
                const roomIndex = rooms.findIndex((room) => room.id === session.roomId);
                if (roomIndex === -1) return null;
                const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
                const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
                const slotIndex = Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes);
                const span = Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes));
                if (slotIndex < 0 || slotIndex >= slotCount) return null;
                return (
                  <div
                    key={session.id}
                    className="relative p-1"
                    style={{ gridColumn: roomIndex + 2, gridRow: `${slotIndex + 2} / span ${span}` }}
                  >
                    <SessionCard session={session} />
                  </div>
                );
              })}

              {showNowLine ? (
                <div
                  className="pointer-events-none absolute right-0 z-10 flex items-center"
                  style={{
                    left: "4.5rem",
                    top: `calc(2.75rem + ${((nowMinutes - DAY_START_MINUTES) / slotMinutes) * 4.5}rem)`,
                  }}
                >
                  <span className="h-1.5 w-1.5 -translate-x-[3px] rounded-full bg-accent" />
                  <div className="h-[2px] flex-1 bg-accent" />
                  <span className="mr-1 -translate-y-1/2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                    agora
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Mobile: uma sala por vez, lista de horários */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex gap-1.5">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                    room.id === mobileRoom?.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {room.name}
                </button>
              ))}
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {mobileRoom
                ? slots.map((slotMinute, slotIndex) => {
                    const session = findSession(mobileRoom.id, slotMinute);
                    return (
                      <li key={slotMinute} className="flex min-h-[3.25rem] items-stretch gap-2 p-1.5">
                        <span className="w-11 shrink-0 pt-1.5 text-[10px] text-muted-foreground">
                          {formatSlotLabel(slotMinute)}
                        </span>
                        <div className="flex-1">
                          {session ? (
                            <SessionCard session={session} compact />
                          ) : occupiedByRoom.get(mobileRoom.id)?.has(slotIndex) ? null : (
                            <EmptySlot roomId={mobileRoom.id} hour={slotMinute} />
                          )}
                        </div>
                      </li>
                    );
                  })
                : null}
            </ul>
          </div>
        </>
      )}

      {panel ? (
        (() => {
          const resolved = panelStateFor();
          if (!resolved) return null;
          return (
            <SessionPanel
              state={resolved}
              professionals={professionals}
              patients={patients}
              defaultProfessionalId={currentProfessionalId}
              onClose={() => setPanel(null)}
              onCreate={handleCreate}
              onSetAttendeeStatus={handleSetAttendeeStatus}
              onAddPatient={handleAddPatient}
              onDeleteSession={handleDeleteSession}
            />
          );
        })()
      ) : null}
    </div>
  );
}
