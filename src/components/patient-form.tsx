"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getApiErrorMessage, post } from "@/lib/api-client";
import { createPatientSchema } from "@/lib/validation/patient";

export interface ProfessionalOption {
  id: string;
  name: string;
}

type FieldErrors = Partial<
  Record<"primaryProfessionalId" | "name" | "phone", string>
>;

export function PatientForm({
  professionals,
  currentProfessionalId,
}: {
  professionals: ProfessionalOption[];
  /** Profissional logado — pré-selecionado por ser o caso mais comum (mesmo
   * padrão de `session-panel.tsx`), se ele estiver entre os ativos da clínica. */
  currentProfessionalId?: string;
}) {
  const router = useRouter();
  const defaultProfessionalId = professionals.some(
    (professional) => professional.id === currentProfessionalId,
  )
    ? currentProfessionalId!
    : (professionals[0]?.id ?? "");
  const [primaryProfessionalId, setPrimaryProfessionalId] = useState(defaultProfessionalId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const result = createPatientSchema.safeParse({
      primaryProfessionalId,
      name,
      phone: phone.trim() === "" ? null : phone,
    });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          field === "primaryProfessionalId" ||
          field === "name" ||
          field === "phone"
        ) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      try {
        await post("/api/v1/patients", result.data);
        router.push("/pacientes");
        router.refresh();
      } catch (error) {
        setFormError(getApiErrorMessage(error, "Não foi possível cadastrar o paciente. Tente novamente."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <Select
        id="primaryProfessionalId"
        label="Profissional responsável"
        value={primaryProfessionalId}
        onChange={(event) => setPrimaryProfessionalId(event.target.value)}
        error={fieldErrors.primaryProfessionalId}
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
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Link href="/pacientes" className="text-sm text-muted-foreground hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
