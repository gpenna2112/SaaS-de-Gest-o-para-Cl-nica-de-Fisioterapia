import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { PatientEditForm } from "@/components/patient-edit-form";
import { getSessionUser } from "@/modules/auth/session";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const { patientId } = await params;
  const db = getDb();
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const professionalsRepository = createProfessionalsRepository(db, sessionUser.clinicId);

  const [patient, professionals] = await Promise.all([
    patientsRepository.getPatient(patientId),
    professionalsRepository.listProfessionals({}),
  ]);

  if (!patient) {
    notFound();
  }

  return (
    <PatientEditForm
      patient={{
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        primaryProfessionalId: patient.primaryProfessionalId,
        active: patient.active,
      }}
      professionals={professionals.map((professional) => ({ id: professional.id, name: professional.name }))}
    />
  );
}
