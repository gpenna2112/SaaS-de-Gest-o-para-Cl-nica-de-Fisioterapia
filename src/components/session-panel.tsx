"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { PatientMultiselect, type PatientOption } from "@/components/patient-multiselect";
import { get, getApiErrorMessage, patch as apiPatch, post as apiPost } from "@/lib/api-client";
import {
  addMinutesToTime,
  combineDateAndTimeInSaoPaulo,
  formatDateSaoPaulo,
  formatTimeSaoPaulo,
} from "@/modules/scheduling/day-range";
import {
  ATTENDEE_STATUS_LABELS as STATUS_LABELS,
  ATTENDEE_STATUS_TONES as STATUS_TONES,
  isValidStatusTransition,
  type AttendeeStatus,
} from "@/modules/scheduling/session-state-machine";
import type { SessionAttendeeView, SessionView } from "@/modules/scheduling/session-view";

export interface ProfessionalOption {
  id: string;
  name: string;
}

export interface RoomOption {
  id: string;
  name: string;
}

const QUICK_ACTIONS: { target: Exclude<AttendeeStatus, "agendada">; label: string; title: string }[] = [
  { target: "realizada", label: "✓", title: "Marcar como realizada" },
  { target: "falta", label: "⊘", title: "Marcar falta" },
  { target: "cancelada", label: "✕", title: "Cancelar" },
];

interface EvolutionData {
  id: string;
  content: string;
  professionalId: string;
}

/**
 * Registro de evolução (ADR-0019) por atendimento `realizada`. Diferente do
 * resto do painel, fala com a API diretamente em vez de subir callback pro
 * pai (`agenda-view.tsx`) — não muda nada que a grade exiba, então não
 * precisa do `router.refresh()` que as outras mutações disparam.
 *
 * Só o autor original edita (backend: `NotEvolutionAuthorError`, 403 — fonte
 * de verdade). Aqui só refletimos essa regra na UI: se `currentProfessionalId`
 * não bate com o autor da nota, mostramos texto somente leitura em vez de um
 * textarea que só falharia ao salvar.
 */
function EvolutionEditor({
  attendeeId,
  currentProfessionalId,
}: {
  attendeeId: string;
  currentProfessionalId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [evolution, setEvolution] = useState<EvolutionData | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isAuthor = !evolution || evolution.professionalId === currentProfessionalId;

  // Busca sob demanda no clique (não em efeito) — só precisamos saber se já
  // existe uma evolução na primeira vez que o profissional abre a seção.
  async function handleToggleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (!willOpen || loaded) return;
    setLoading(true);
    try {
      const result = await get<{ evolution: EvolutionData | null }>(
        `/api/v1/session-attendees/${attendeeId}/evolution`,
      );
      if (result.evolution) {
        setEvolution(result.evolution);
        setContent(result.evolution.content);
      }
      setLoaded(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a evolução."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      if (evolution) {
        const result = await apiPatch<{ evolution: EvolutionData }>(`/api/v1/evolutions/${evolution.id}`, { content });
        setEvolution(result.evolution);
      } else {
        const result = await apiPost<{ evolution: EvolutionData }>(`/api/v1/session-attendees/${attendeeId}/evolution`, {
          content,
        });
        setEvolution(result.evolution);
      }
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível salvar a evolução."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-2">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="text-left text-xs font-semibold text-primary hover:underline"
      >
        {open ? "Ocultar evolução" : evolution ? (isAuthor ? "Ver/editar evolução" : "Ver evolução") : "+ Registrar evolução"}
      </button>
      {open ? (
        loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : isAuthor ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setSaved(false);
              }}
              rows={3}
              placeholder="Como foi o atendimento..."
              className="rounded-md border border-input-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {saved ? <p className="text-xs text-primary">Salvo.</p> : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-8 w-fit px-3 py-1 text-xs"
              disabled={isSaving || content.trim() === ""}
              onClick={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar evolução"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="whitespace-pre-wrap rounded-md border border-input-border bg-background px-2 py-1.5 text-xs text-foreground">
              {content}
            </p>
            <p className="text-xs text-muted-foreground">Só quem registrou esta evolução pode editá-la.</p>
          </div>
        )
      ) : null}
    </div>
  );
}

function quickActionButtonClass(active: boolean) {
  return `flex h-7 w-7 items-center justify-center rounded-md border text-sm ${
    active
      ? "border-input-border bg-muted text-foreground"
      : "border-input-border text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

export type PanelState =
  | {
      mode: "create";
      roomId: string;
      roomName: string;
      roomType: string;
      roomCapacity: number;
      dayHourLabel: string;
      hourLabel: string;
    }
  | {
      mode: "edit";
      session: SessionView;
      roomId: string;
      roomName: string;
      roomType: string;
      roomCapacity: number;
      dayHourLabel: string;
      professionalName: string;
    };

export function SessionPanel({
  state,
  professionals,
  patients,
  rooms,
  slotMinutes,
  defaultProfessionalId,
  currentProfessionalId,
  onClose,
  onCreate,
  onSetAttendeeStatus,
  onAddPatient,
  onDeleteSession,
  onReschedule,
}: {
  state: PanelState;
  professionals: ProfessionalOption[];
  patients: PatientOption[];
  rooms: RoomOption[];
  slotMinutes: number;
  defaultProfessionalId?: string;
  currentProfessionalId?: string;
  onClose: () => void;
  onCreate: (input: { professionalId: string; patientIds: string[] }) => Promise<void>;
  onSetAttendeeStatus: (attendeeId: string, status: AttendeeStatus) => Promise<void>;
  onAddPatient: (patientId: string) => Promise<void>;
  onDeleteSession: (session: SessionView) => Promise<void>;
  onReschedule: (
    session: SessionView,
    input: { roomId: string; scheduledStart: string; scheduledEnd: string },
  ) => Promise<void>;
}) {
  const [professionalId, setProfessionalId] = useState(
    defaultProfessionalId && professionals.some((p) => p.id === defaultProfessionalId)
      ? defaultProfessionalId
      : (professionals[0]?.id ?? ""),
  );
  const [patientIds, setPatientIds] = useState<string[]>([]);
  const [singlePatientId, setSinglePatientId] = useState("");
  const [addPatientId, setAddPatientId] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const isEdit = state.mode === "edit";
  const isPilates = state.roomType === "pilates";

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleRoomId, setRescheduleRoomId] = useState(() => (isEdit ? state.roomId : ""));
  const [rescheduleDate, setRescheduleDate] = useState(() =>
    isEdit ? formatDateSaoPaulo(state.session.scheduledStart) : "",
  );
  const [rescheduleTime, setRescheduleTime] = useState(() =>
    isEdit ? formatTimeSaoPaulo(state.session.scheduledStart) : "",
  );

  const activeAttendees: SessionAttendeeView[] = isEdit
    ? state.session.attendees.filter((attendee) => attendee.status !== "cancelada")
    : [];
  const availableToAdd = patients.filter(
    (patient) => !activeAttendees.some((attendee) => attendee.patientId === patient.id),
  );
  // "Cancelar sessão" só cancela quem ainda permite a transição — se todo
  // mundo já está realizada/falta (registro histórico, ADR-0010), não há
  // participante ativo para cancelar.
  const canDelete = activeAttendees.some((attendee) =>
    isValidStatusTransition(attendee.status as AttendeeStatus, "cancelada"),
  );

  async function run(key: string, action: () => Promise<void>) {
    setError(null);
    setPendingKey(key);
    try {
      await action();
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível concluir a ação."));
    } finally {
      setPendingKey(null);
    }
  }

  // Handler dedicado (não usa `run`, que engole o erro): o ConfirmDialog
  // precisa que a promise rejeite para saber que deve permanecer aberto.
  async function handleConfirmDelete() {
    if (!isEdit) return;
    setError(null);
    setPendingKey("delete");
    try {
      await onDeleteSession(state.session);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível cancelar a sessão."));
      throw err;
    } finally {
      setPendingKey(null);
    }
  }

  function handleCreate() {
    const ids = isPilates ? patientIds : singlePatientId ? [singlePatientId] : [];
    if (!professionalId || ids.length === 0) {
      setError("Selecione o profissional e ao menos um paciente.");
      return;
    }
    run("create", () => onCreate({ professionalId, patientIds: ids }));
  }

  function handleReschedule() {
    if (!isEdit) return;
    if (!rescheduleRoomId || !rescheduleDate || !rescheduleTime) {
      setError("Selecione sala, data e horário para remarcar.");
      return;
    }
    const scheduledStart = combineDateAndTimeInSaoPaulo(rescheduleDate, rescheduleTime);
    const scheduledEnd = combineDateAndTimeInSaoPaulo(rescheduleDate, addMinutesToTime(rescheduleTime, slotMinutes));
    run("reschedule", () => onReschedule(state.session, { roomId: rescheduleRoomId, scheduledStart, scheduledEnd }));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">{state.roomName}</div>
            <div className="text-base font-semibold">{state.dayHourLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-md text-xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Fisioterapeuta</span>
          {isEdit ? (
            <div className="rounded-md border border-input-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {state.professionalName}
              <span className="ml-1 text-xs">(fixo após criada)</span>
            </div>
          ) : (
            <Select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
              <option value="" disabled>
                Selecionar…
              </option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Paciente(s) · {isEdit ? activeAttendees.length : (isPilates ? patientIds.length : singlePatientId ? 1 : 0)}/{state.roomCapacity}
          </span>

          {isEdit ? (
            <div className="flex flex-col gap-2">
              <ul className="flex flex-col gap-2 rounded-md border border-input-border p-2">
                {activeAttendees.map((attendee) => {
                  const targets = QUICK_ACTIONS.filter((qa) =>
                    isValidStatusTransition(attendee.status as AttendeeStatus, qa.target),
                  );
                  return (
                    <li key={attendee.id} className="flex flex-col gap-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{attendee.patientName ?? "Paciente"}</span>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge tone={STATUS_TONES[attendee.status as AttendeeStatus] ?? "neutral"}>
                            {STATUS_LABELS[attendee.status as AttendeeStatus] ?? attendee.status}
                          </StatusBadge>
                          {targets.map((qa) => (
                            <button
                              key={qa.target}
                              type="button"
                              title={qa.title}
                              disabled={pendingKey === attendee.id}
                              className={quickActionButtonClass(false)}
                              onClick={() => run(attendee.id, () => onSetAttendeeStatus(attendee.id, qa.target))}
                            >
                              {qa.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {attendee.status === "realizada" ? (
                        <EvolutionEditor attendeeId={attendee.id} currentProfessionalId={currentProfessionalId} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {activeAttendees.length < state.roomCapacity && availableToAdd.length > 0 ? (
                <div className="flex gap-2">
                  <Select value={addPatientId} onChange={(event) => setAddPatientId(event.target.value)}>
                    <option value="">+ adicionar paciente…</option>
                    {availableToAdd.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={!addPatientId || pendingKey === "add"}
                    onClick={() =>
                      run("add", async () => {
                        await onAddPatient(addPatientId);
                        setAddPatientId("");
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
          ) : isPilates ? (
            <PatientMultiselect
              patients={patients}
              selected={patientIds}
              onChange={setPatientIds}
              capacity={state.roomCapacity}
            />
          ) : (
            <Select value={singlePatientId} onChange={(event) => setSinglePatientId(event.target.value)}>
              <option value="">Selecionar…</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {isEdit ? (
          <div className="flex flex-col gap-2 rounded-md border border-input-border p-3">
            <button
              type="button"
              onClick={() => setRescheduleOpen((current) => !current)}
              className="flex items-center justify-between text-left text-sm font-semibold text-foreground"
            >
              Remarcar sessão
              <span className="text-xs font-normal text-muted-foreground">{rescheduleOpen ? "▲" : "▼"}</span>
            </button>
            {rescheduleOpen ? (
              <div className="flex flex-col gap-2">
                <Select value={rescheduleRoomId} onChange={(event) => setRescheduleRoomId(event.target.value)}>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={rescheduleDate}
                    onChange={(event) => setRescheduleDate(event.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="time"
                    value={rescheduleTime}
                    onChange={(event) => setRescheduleTime(event.target.value)}
                    className="flex-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={pendingKey === "reschedule"}
                  onClick={handleReschedule}
                >
                  {pendingKey === "reschedule" ? "Remarcando…" : "Confirmar remarcação"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="mt-2 flex gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
            {isEdit ? "Fechar" : "Cancelar"}
          </Button>
          {!isEdit ? (
            <Button type="button" className="min-h-11" disabled={pendingKey === "create"} onClick={handleCreate}>
              {pendingKey === "create" ? "Criando…" : "Criar sessão"}
            </Button>
          ) : null}
        </div>
        {isEdit && canDelete ? (
          <Button
            type="button"
            variant="danger"
            disabled={pendingKey === "delete"}
            onClick={() => setConfirmCancelOpen(true)}
            className="min-h-11"
          >
            {pendingKey === "delete" ? "Cancelando…" : "Cancelar sessão"}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancelar esta sessão?"
        description="Participantes já marcados como realizada ou falta não são afetados — só quem ainda está agendado ou confirmado é cancelado."
        confirmLabel="Cancelar sessão"
        isConfirming={pendingKey === "delete"}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
