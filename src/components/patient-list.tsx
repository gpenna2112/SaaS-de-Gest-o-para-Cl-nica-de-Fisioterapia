import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";

export interface PatientListItem {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  professionalName: string;
}

export function PatientList({ patients }: { patients: PatientListItem[] }) {
  if (patients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum paciente cadastrado ainda.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {patients.map((patient) => (
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
  );
}
