import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { PatientList } from "@/components/patient-list";
import { getSessionUser } from "@/modules/auth/session";

export default async function PatientsPage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const db = getDb();
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const professionalsRepository = createProfessionalsRepository(
    db,
    sessionUser.clinicId,
  );

  const [patients, professionals] = await Promise.all([
    patientsRepository.listPatients({}),
    professionalsRepository.listProfessionals({}),
  ]);

  const professionalNameById = new Map(
    professionals.map((professional) => [professional.id, professional.name]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pacientes</h1>
        <Link
          href="/pacientes/novo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Novo paciente
        </Link>
      </div>
      <PatientList
        patients={patients.map((patient) => ({
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          active: patient.active,
          professionalName:
            professionalNameById.get(patient.primaryProfessionalId) ?? "—",
        }))}
      />
    </div>
  );
}
