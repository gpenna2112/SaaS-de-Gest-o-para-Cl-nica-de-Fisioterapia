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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
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
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-xs">
          <ul className="flex flex-col divide-y divide-border">
            {filtered.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={`/pacientes/${patient.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                        patient.active ? "bg-teal-100 text-teal-800" : "bg-muted text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    >
                      {initials(patient.name)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{patient.name}</span>
                      <span className="truncate text-[12.5px] text-muted-foreground">
                        {patient.professionalName}
                        {patient.phone ? ` · ${patient.phone}` : ""}
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone={patient.active ? "success" : "neutral"} className="shrink-0">
                    {patient.active ? "Ativo" : "Inativo"}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
