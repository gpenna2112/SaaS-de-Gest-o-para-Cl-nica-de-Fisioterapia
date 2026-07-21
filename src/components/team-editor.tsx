"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage, patch, post } from "@/lib/api-client";
import { createProfessionalSchema } from "@/lib/validation/professional";

export interface ProfessionalItem {
  id: string;
  name: string;
  email: string;
  role: "fisioterapeuta" | "gestora";
  active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  fisioterapeuta: "Fisioterapeuta",
  gestora: "Gestora",
};

function NewProfessionalForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"fisioterapeuta" | "gestora">("fisioterapeuta");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = createProfessionalSchema.safeParse({ name, email, role });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    startTransition(async () => {
      try {
        await post("/api/v1/professionals", result.data);
        setName("");
        setEmail("");
        setRole("fisioterapeuta");
        setOpen(false);
        onCreated();
      } catch (err) {
        setError(getApiErrorMessage(err, "Não foi possível cadastrar. Tente novamente."));
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Novo fisioterapeuta
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} />
      <Input placeholder="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <Select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
        <option value="fisioterapeuta">Fisioterapeuta</option>
        <option value="gestora">Gestora</option>
      </Select>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Cadastrar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ProfessionalRow({ professional, onChanged }: { professional: ProfessionalItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(professional.name);
  const [email, setEmail] = useState(professional.email);
  const [role, setRole] = useState(professional.role);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isToggling, startToggling] = useTransition();

  function handleSave() {
    setError(null);
    startSaving(async () => {
      try {
        await patch(`/api/v1/professionals/${professional.id}`, { name, email, role });
        setEditing(false);
        onChanged();
      } catch (err) {
        setError(getApiErrorMessage(err, "Não foi possível salvar. Tente novamente."));
      }
    });
  }

  function handleToggleActive() {
    startToggling(async () => {
      try {
        await patch(`/api/v1/professionals/${professional.id}`, { active: !professional.active });
        onChanged();
      } catch {
        // erro silencioso aqui é aceitável: a lista simplesmente não muda e o
        // botão volta ao estado normal, sem bloquear a tela.
      }
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        <Input value={email} onChange={(event) => setEmail(event.target.value)} />
        <Select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
          <option value="fisioterapeuta">Fisioterapeuta</option>
          <option value="gestora">Gestora</option>
        </Select>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{professional.name}</span>
        {!professional.active ? <StatusBadge tone="neutral">Inativo</StatusBadge> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{ROLE_LABELS[professional.role] ?? professional.role}</span>
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-primary hover:underline">
          Editar
        </button>
        <button
          type="button"
          disabled={isToggling}
          onClick={handleToggleActive}
          className="text-sm text-danger hover:underline disabled:opacity-50"
        >
          {professional.active ? "Desativar" : "Reativar"}
        </button>
      </div>
    </li>
  );
}

export function TeamEditor({ professionals }: { professionals: ProfessionalItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <ul className="flex flex-col divide-y divide-border">
          {professionals.map((professional) => (
            <ProfessionalRow key={professional.id} professional={professional} onChanged={refresh} />
          ))}
        </ul>
      </div>
      <NewProfessionalForm onCreated={refresh} />
    </div>
  );
}
