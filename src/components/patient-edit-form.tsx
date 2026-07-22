"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage, patch } from "@/lib/api-client";
import { updatePatientSchema } from "@/lib/validation/patient";

export interface ProfessionalOption {
  id: string;
  name: string;
}

type FieldErrors = Partial<Record<"primaryProfessionalId" | "name" | "phone", string>>;

export function PatientEditForm({
  patient,
  professionals,
}: {
  patient: { id: string; name: string; phone: string | null; primaryProfessionalId: string; active: boolean };
  professionals: ProfessionalOption[];
}) {
  const router = useRouter();
  const [primaryProfessionalId, setPrimaryProfessionalId] = useState(patient.primaryProfessionalId);
  const [name, setName] = useState(patient.name);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [active, setActive] = useState(patient.active);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingFields, startSavingFields] = useTransition();
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const result = updatePatientSchema.safeParse({
      primaryProfessionalId,
      name,
      phone: phone.trim() === "" ? null : phone,
    });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "primaryProfessionalId" || field === "name" || field === "phone") {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    startSavingFields(async () => {
      try {
        await patch(`/api/v1/patients/${patient.id}`, result.data);
        router.refresh();
      } catch (error) {
        setFormError(getApiErrorMessage(error, "Não foi possível salvar as alterações. Tente novamente."));
      }
    });
  }

  async function handleReactivate() {
    setFormError(null);
    setIsTogglingActive(true);
    try {
      await patch(`/api/v1/patients/${patient.id}`, { active: true });
      setActive(true);
      router.refresh();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Não foi possível concluir a ação. Tente novamente."));
    } finally {
      setIsTogglingActive(false);
    }
  }

  // Não usa `run`/`startTransition`: o ConfirmDialog precisa que a promise
  // rejeite para saber que deve permanecer aberto.
  async function handleConfirmDeactivate() {
    setFormError(null);
    setIsTogglingActive(true);
    try {
      await patch(`/api/v1/patients/${patient.id}`, { active: false });
      setActive(false);
      router.refresh();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Não foi possível desativar o paciente. Tente novamente."));
      throw error;
    } finally {
      setIsTogglingActive(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{patient.name}</h1>
        <StatusBadge tone={active ? "success" : "neutral"}>{active ? "Ativo" : "Inativo"}</StatusBadge>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          id="primaryProfessionalId"
          label="Profissional responsável"
          value={primaryProfessionalId}
          onChange={(event) => setPrimaryProfessionalId(event.target.value)}
          error={fieldErrors.primaryProfessionalId}
        >
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
        <Input
          id="name"
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />
        <Input
          id="phone"
          label="Telefone (opcional)"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={fieldErrors.phone}
        />
        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSavingFields || isTogglingActive}>
            {isSavingFields ? "Salvando..." : "Salvar alterações"}
          </Button>
          <Link href="/pacientes" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar
          </Link>
        </div>
      </form>

      <div className="border-t border-border pt-4">
        <Button
          type="button"
          variant={active ? "danger" : "secondary"}
          disabled={isTogglingActive || isSavingFields}
          onClick={() => (active ? setConfirmDeactivateOpen(true) : handleReactivate())}
        >
          {isTogglingActive ? "Aguarde..." : active ? "Desativar paciente" : "Reativar paciente"}
        </Button>
        {active ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Desativar bloqueia novos agendamentos, mas não cancela sessões já existentes.
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDeactivateOpen}
        onOpenChange={setConfirmDeactivateOpen}
        title={`Desativar ${patient.name}?`}
        description="Bloqueia novos agendamentos. Sessões já existentes não são canceladas."
        confirmLabel="Desativar"
        isConfirming={isTogglingActive}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}
