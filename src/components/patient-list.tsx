"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

export interface PatientListItem {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  professionalName: string;
}

export function PatientList({ patients }: { patients: PatientListItem[] }) {
  const [query, setQuery] = useState("");

  if (patients.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum paciente cadastrado ainda.</p>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? patients.filter((patient) => patient.name.toLowerCase().includes(normalizedQuery))
    : patients;

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar paciente pelo nome…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar paciente pelo nome"
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum paciente encontrado para &quot;{query}&quot;.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/pacientes/${patient.id}`}
                className="flex items-center justify-between gap-4 py-3 hover:bg-muted"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{patient.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {patient.professionalName}
                    {patient.phone ? ` · ${patient.phone}` : ""}
                  </span>
                </div>
                <StatusBadge tone={patient.active ? "success" : "neutral"}>
                  {patient.active ? "Ativo" : "Inativo"}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
