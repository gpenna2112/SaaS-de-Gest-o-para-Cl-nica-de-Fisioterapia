"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PatientMultiselect, type PatientOption } from "@/components/patient-multiselect";
import { getApiErrorMessage, post } from "@/lib/api-client";
import { createSessionSchema } from "@/lib/validation/session";
import { addMinutesToTime, combineDateAndTimeInSaoPaulo } from "@/modules/scheduling/day-range";

const DEFAULT_START_TIME = "09:00";

export interface ProfessionalOption {
  id: string;
  name: string;
}

export interface RoomOption {
  id: string;
  name: string;
  capacity: number;
}

type FieldErrors = Partial<
  Record<"professionalId" | "roomId" | "scheduledStart" | "scheduledEnd" | "patientIds", string>
>;

export function SessionForm({
  professionals,
  rooms,
  patients,
  defaultDurationMinutes,
  initialDate,
  currentProfessionalId,
}: {
  professionals: ProfessionalOption[];
  rooms: RoomOption[];
  patients: PatientOption[];
  defaultDurationMinutes: number;
  initialDate: string;
  /** Profissional logado — pré-selecionado por ser o caso mais comum (a
   * própria fisio se agendando), se ele estiver entre os ativos da clínica. */
  currentProfessionalId?: string;
}) {
  const router = useRouter();
  const defaultProfessionalId = professionals.some((professional) => professional.id === currentProfessionalId)
    ? currentProfessionalId!
    : (professionals[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(() => addMinutesToTime(DEFAULT_START_TIME, defaultDurationMinutes));
  const [patientIds, setPatientIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedRoomCapacity = rooms.find((room) => room.id === roomId)?.capacity ?? 1;

  // Trocar para uma sala menor desmarca os pacientes excedentes — nunca o
  // contrário (não seleciona ninguém automaticamente ao aumentar a sala).
  // Derivado direto no evento, não em useEffect: não há nada externo para
  // sincronizar, é só um ajuste de estado em resposta à própria interação.
  function handleRoomChange(newRoomId: string) {
    setRoomId(newRoomId);
    const newCapacity = rooms.find((room) => room.id === newRoomId)?.capacity ?? 1;
    setPatientIds((current) => current.slice(0, newCapacity));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const result = createSessionSchema.safeParse({
      professionalId,
      roomId,
      scheduledStart: combineDateAndTimeInSaoPaulo(date, startTime),
      scheduledEnd: combineDateAndTimeInSaoPaulo(date, endTime),
      patientIds,
    });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          field === "professionalId" ||
          field === "roomId" ||
          field === "scheduledStart" ||
          field === "scheduledEnd" ||
          field === "patientIds"
        ) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      try {
        await post("/api/v1/sessions", result.data);
        router.push(`/agenda?date=${date}`);
        router.refresh();
      } catch (error) {
        setFormError(getApiErrorMessage(error, "Não foi possível criar a sessão. Tente novamente."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <Select
        id="professionalId"
        label="Profissional"
        value={professionalId}
        onChange={(event) => setProfessionalId(event.target.value)}
        error={fieldErrors.professionalId}
      >
        <option value="" disabled>
          Selecione...
        </option>
        {professionals.map((professional) => (
          <option key={professional.id} value={professional.id}>
            {professional.name}
          </option>
        ))}
      </Select>
      <Select
        id="roomId"
        label="Sala"
        value={roomId}
        onChange={(event) => handleRoomChange(event.target.value)}
        error={fieldErrors.roomId}
      >
        <option value="" disabled>
          Selecione...
        </option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name} (capacidade {room.capacity})
          </option>
        ))}
      </Select>
      <Input id="date" label="Data" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <div className="flex gap-4">
        <Input
          id="startTime"
          label="Início"
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          error={fieldErrors.scheduledStart}
        />
        <Input
          id="endTime"
          label="Término"
          type="time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          error={fieldErrors.scheduledEnd}
        />
      </div>
      <div>
        <PatientMultiselect
          patients={patients}
          selected={patientIds}
          onChange={setPatientIds}
          capacity={selectedRoomCapacity}
        />
        {fieldErrors.patientIds ? <p className="mt-1 text-sm text-danger">{fieldErrors.patientIds}</p> : null}
      </div>
      {formError ? <p className="text-sm text-danger">{formError}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando..." : "Criar sessão"}
      </Button>
    </form>
  );
}
