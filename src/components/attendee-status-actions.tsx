"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getApiErrorMessage, patch } from "@/lib/api-client";
import { isValidStatusTransition, type AttendeeStatus } from "@/modules/scheduling/session-state-machine";

const ACTION_LABELS: Record<Exclude<AttendeeStatus, "agendada">, string> = {
  confirmada: "Confirmar",
  realizada: "Realizada",
  falta: "Falta",
  cancelada: "Cancelar",
};

// Mesma ordem em todo attendee, independente de quais ações estão disponíveis
// — evita que o botão "Falta" pule de posição conforme o status atual.
const ACTION_ORDER: Exclude<AttendeeStatus, "agendada">[] = ["confirmada", "realizada", "falta", "cancelada"];

export function AttendeeStatusActions({ attendeeId, status }: { attendeeId: string; status: AttendeeStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<AttendeeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableActions = ACTION_ORDER.filter((target) => isValidStatusTransition(status, target));

  if (availableActions.length === 0) {
    return null;
  }

  function handleUpdate(target: AttendeeStatus) {
    setError(null);
    setPendingTarget(target);
    startTransition(async () => {
      try {
        await patch(`/api/v1/session-attendees/${attendeeId}`, { status: target });
        router.refresh();
      } catch (err) {
        setError(getApiErrorMessage(err, "Não foi possível atualizar."));
      } finally {
        setPendingTarget(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap gap-1">
        {availableActions.map((target) => (
          <button
            key={target}
            type="button"
            disabled={isPending}
            onClick={() => handleUpdate(target)}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
          >
            {isPending && pendingTarget === target ? "..." : ACTION_LABELS[target]}
          </button>
        ))}
      </div>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
