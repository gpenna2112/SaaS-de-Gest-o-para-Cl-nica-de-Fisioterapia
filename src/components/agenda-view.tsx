"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SessionPanel, type PanelState, type ProfessionalOption } from "@/components/session-panel";
import { patch, post } from "@/lib/api-client";
import {
  addDaysToDateString,
  combineDateAndTimeInSaoPaulo,
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  formatDateLongPtBr,
  formatDateSaoPaulo,
  formatMinutesAsTime as formatSlotLabel,
  formatTimeSaoPaulo as formatTime,
  getMondayOfWeek,
  minutesSinceMidnightSaoPaulo,
} from "@/modules/scheduling/day-range";
import {
  ATTENDEE_STATUS_LABELS as STATUS_LABELS,
  ATTENDEE_STATUS_TONES as STATUS_TONES,
  isValidStatusTransition,
  type AttendeeStatus,
} from "@/modules/scheduling/session-state-machine";
import type { SessionView } from "@/modules/scheduling/session-view";
import type { PatientOption } from "@/components/patient-multiselect";

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export interface AgendaRoom {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.12-2.9-6.99A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.66-.6-2.92-1.26-4.83-4.2-4.98-4.4-.15-.2-1.2-1.6-1.2-3.05s.76-2.16 1.03-2.46c.27-.3.58-.37.78-.37.2 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.14.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.66 2.06 1.14 1.02 2.1 1.34 2.4 1.49.3.15.47.13.65-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.66-.15.27.1 1.7.8 2 .95.3.15.5.22.57.35.07.13.07.75-.17 1.43Z" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 9v-1a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75"
      />
    </svg>
  );
}

export function AgendaView({
  date,
  rooms,
  sessions,
  slotMinutes,
  professionals,
  patients,
  patientPhoneById,
  cancelledCount,
  currentProfessionalId,
}: {
  date: string;
  rooms: AgendaRoom[];
  sessions: SessionView[];
  slotMinutes: number;
  professionals: ProfessionalOption[];
  patients: PatientOption[];
  patientPhoneById: Record<string, string | null>;
  cancelledCount: number;
  currentProfessionalId?: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<
    { mode: "create"; roomId: string; hour: number } | { mode: "edit"; sessionId: string; roomId: string } | null
  >(null);
  const [mobileRoomId, setMobileRoomId] = useState(rooms[0]?.id ?? "");
  const [filterProfessionalId, setFilterProfessionalId] = useState("");
  const [filterRoomId, setFilterRoomId] = useState("");
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
  const todayStr = formatDateSaoPaulo(now);
  const showNowLine = date === todayStr && nowMinutes >= DAY_START_MINUTES && nowMinutes <= DAY_END_MINUTES;

  const visibleRooms = filterRoomId ? rooms.filter((room) => room.id === filterRoomId) : rooms;
  const visibleSessions = sessions.filter(
    (session) =>
      (!filterProfessionalId || session.professionalId === filterProfessionalId) &&
      visibleRooms.some((room) => room.id === session.roomId),
  );

  // Contadores do dia exibido — sem filtro de fisio/sala aplicado, é uma
  // visão do dia todo. `cancelledCount` vem do servidor (page.tsx) porque
  // `sessions` aqui só traz turmas com `status = 'ativa'` — uma turma
  // cancelada por completo não está neste array (ver countCancelledAttendees).
  const allAttendeesToday = sessions.flatMap((session) => session.attendees);
  const sessionsCount = sessions.length;
  const pendingCount = allAttendeesToday.filter((attendee) => attendee.status === "agendada").length;
  const activeRoomsCount = rooms.length;

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
   * Sessão visível (após filtro de fisio/sala) que *começa* neste slot — por
   * índice de slot (não igualdade exata de minuto), porque o horário real de
   * uma sessão nem sempre cai exatamente num múltiplo de `slotMinutes` a
   * partir de 07:00 (a duração padrão pode mudar, ou a sessão foi criada com
   * horário livre).
   */
  function findSession(roomId: string, slotMinute: number) {
    const slotIndex = (slotMinute - DAY_START_MINUTES) / slotMinutes;
    return visibleSessions.find((session) => {
      if (session.roomId !== roomId) return false;
      const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
      return Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes) === slotIndex;
    });
  }

  function isRoomActiveNow(roomId: string): boolean {
    if (date !== todayStr) return false;
    return sessions.some((session) => {
      if (session.roomId !== roomId) return false;
      const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
      const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
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

  async function handleReschedule(
    session: SessionView,
    input: { roomId: string; scheduledStart: string; scheduledEnd: string },
  ) {
    await withRefresh(() => patch(`/api/v1/sessions/${session.id}`, input));
    setPanel(null);
  }

  async function handleDeleteSession(session: SessionView) {
    // Só cancela quem ainda permite a transição (agendada/confirmada) — um
    // attendee já realizada/falta é registro histórico permanente (ADR-0010),
    // "cancelar" não desfaz o que já aconteceu.
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
    const professional = professionals.find((p) => p.id === session.professionalId);
    const singlePhone = active.length === 1 ? (patientPhoneById[active[0]?.patientId ?? ""] ?? null) : null;
    const whatsappHref = singlePhone ? `https://wa.me/${singlePhone.replace("+", "")}` : null;
    // Aguardando confirmação (algum attendee ainda "agendada") ganha
    // destaque âmbar no bloco em si — hoje só era visível abrindo o card.
    const isPending = active.some((attendee) => attendee.status === "agendada");

    return (
      <div
        className={`z-10 flex gap-1 overflow-hidden rounded-md border p-1.5 text-xs transition-shadow duration-150 hover:shadow-md ${
          isPending ? "border-amber-300 bg-warning" : "border-teal-300 bg-teal-50"
        } ${compact ? "h-full w-full" : "absolute inset-1"}`}
      >
        <button
          type="button"
          onClick={() => setPanel({ mode: "edit", sessionId: session.id, roomId: session.roomId })}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-left"
        >
          {/* Ordem de prioridade quando o espaço é curto: horário > paciente
              (informação principal) > fisioterapeuta (bem visível, em pill
              colorida) > status (badge, o primeiro a ser sacrificado). */}
          {!compact ? (
            <span className="flex shrink-0 items-center justify-between gap-1">
              {/* Só o horário final: o inicial já é a própria linha da grade
                  onde o card começa — repetir os dois é redundante e disputa
                  espaço com paciente/fisioterapeuta, que importam mais aqui. */}
              <span className="shrink-0 truncate font-mono text-[10px] font-medium text-muted-foreground">
                até {formatTime(session.scheduledEnd)}
              </span>
              {professional ? (
                <span className="min-w-0 truncate rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {professional.name}
                </span>
              ) : null}
            </span>
          ) : null}
          {/* Lista rola internamente quando não couber (salas com mais de 1
              paciente, ex. Pilates) — o card em si nunca ultrapassa a célula
              da agenda, ver inset-1 + overflow-hidden acima. */}
          <span className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {active.map((attendee) => (
              <span key={attendee.id} className="flex shrink-0 items-center justify-between gap-1">
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {attendee.patientName ?? "Paciente"}
                </span>
                <StatusBadge tone={STATUS_TONES[attendee.status as AttendeeStatus] ?? "neutral"} className="shrink-0">
                  {STATUS_LABELS[attendee.status as AttendeeStatus] ?? attendee.status}
                </StatusBadge>
              </span>
            ))}
          </span>
        </button>
        {!compact ? (
          <div className="flex shrink-0 flex-col gap-1 self-start">
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversa no WhatsApp"
                aria-label="Abrir conversa no WhatsApp"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-input-border bg-background text-primary hover:bg-muted"
              >
                <WhatsAppIcon />
              </a>
            ) : null}
            <button
              type="button"
              title="Mais opções"
              aria-label="Mais opções"
              onClick={() => setPanel({ mode: "edit", sessionId: session.id, roomId: session.roomId })}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-input-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              …
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function EmptySlot({ roomId, hour }: { roomId: string; hour: number }) {
    const label = formatSlotLabel(hour);
    const endLabel = formatSlotLabel(hour + slotMinutes);
    const roomName = roomOf(roomId).name;
    return (
      <button
        type="button"
        onClick={() => setPanel({ mode: "create", roomId, hour })}
        aria-label={`Nova sessão em ${roomName}, ${label}–${endLabel}`}
        className="group flex h-full w-full items-center justify-center rounded-md border border-dashed border-input-border text-muted-foreground/70 hover:bg-muted hover:text-foreground"
      >
        <span className="text-lg font-extralight group-hover:hidden">+</span>
        <span className="hidden text-[11px] group-hover:inline">
          + {label}–{endLabel}
        </span>
      </button>
    );
  }

  const mobileRoom = visibleRooms.find((room) => room.id === mobileRoomId) ?? visibleRooms[0];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold tracking-tight">Agenda</h1>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
          <button type="button" className="rounded-md bg-background px-3 py-1.5 text-foreground shadow-sm">
            Dia
          </button>
          <button
            type="button"
            disabled
            title="Em breve"
            className="cursor-not-allowed rounded-md px-3 py-1.5 text-muted-foreground/60"
          >
            Semana
          </button>
          <button
            type="button"
            disabled
            title="Em breve"
            className="cursor-not-allowed rounded-md px-3 py-1.5 text-muted-foreground/60"
          >
            Mês
          </button>
        </div>
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
          <Link href={`/agenda?date=${formatDateSaoPaulo(new Date())}`} className="rounded-md border border-input-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            Hoje
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filtrar por fisioterapeuta"
            value={filterProfessionalId}
            onChange={(event) => setFilterProfessionalId(event.target.value)}
            className="min-w-[10rem]"
          >
            <option value="">Todos os fisioterapeutas</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por sala"
            value={filterRoomId}
            onChange={(event) => setFilterRoomId(event.target.value)}
            className="min-w-[9rem]"
          >
            <option value="">Todas as salas</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-wrap gap-2">
          <StatCard tone="primary" value={sessionsCount} label="Sessões hoje" />
          <StatCard tone="warning" value={pendingCount} label="Pendentes" />
          <StatCard tone="danger" value={cancelledCount} label="Cancelada" />
          <StatCard tone="neutral" value={activeRoomsCount} label="Salas ativas" />
        </div>
      </div>

      <p className="text-sm font-semibold text-muted-foreground">{formatDateLongPtBr(date)}</p>

      {visibleRooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sala ativa cadastrada.</p>
      ) : (
        <>
          {/* Desktop: grade por sala */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
            <div
              className="relative grid min-w-max"
              style={{
                gridTemplateColumns: `4.5rem repeat(${visibleRooms.length}, minmax(11rem, 1fr))`,
                gridTemplateRows: `2.75rem repeat(${slotCount}, 4.5rem)`,
              }}
            >
              <div className="border-b border-border bg-muted/40" style={{ gridColumn: 1, gridRow: 1 }} />
              {visibleRooms.map((room, roomIndex) => (
                <div
                  key={room.id}
                  className="flex items-center justify-center gap-1.5 border-b border-border bg-muted/40 text-sm font-semibold"
                  style={{ gridColumn: roomIndex + 2, gridRow: 1 }}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${isRoomActiveNow(room.id) ? "bg-primary" : "bg-transparent"}`}
                    aria-hidden="true"
                  />
                  {room.name}
                  <span
                    className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                    aria-label={`Capacidade: ${room.capacity}`}
                  >
                    <PeopleIcon />
                    {room.capacity}
                  </span>
                </div>
              ))}

              {slots.map((slotMinute, slotIndex) => (
                <div
                  key={slotMinute}
                  className="border-b border-border p-1.5 pt-1 font-mono text-[11px] text-muted-foreground"
                  style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
                >
                  {formatSlotLabel(slotMinute)}
                </div>
              ))}

              {visibleRooms.map((room, roomIndex) =>
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

              {visibleSessions.map((session) => {
                const roomIndex = visibleRooms.findIndex((room) => room.id === session.roomId);
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
              {visibleRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setMobileRoomId(room.id)}
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
                        <span className="w-11 shrink-0 pt-1.5 font-mono text-[10px] text-muted-foreground">
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

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-teal-300 bg-teal-50" />
              Confirmada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-warning" />
              Aguardando confirmação
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-coral-200 bg-coral-50" />
              Cancelada
            </span>
            <span>{cancelledCount} sessão(ões) cancelada(s) hoje</span>
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
              rooms={rooms}
              slotMinutes={slotMinutes}
              defaultProfessionalId={currentProfessionalId}
              currentProfessionalId={currentProfessionalId}
              onClose={() => setPanel(null)}
              onReschedule={handleReschedule}
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
