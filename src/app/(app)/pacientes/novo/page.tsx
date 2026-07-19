import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { PatientForm } from "@/components/patient-form";
import { getSessionUser } from "@/modules/auth/session";

export default async function NewPatientPage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const professionalsRepository = createProfessionalsRepository(
    getDb(),
    sessionUser.clinicId,
  );
  const professionals = await professionalsRepository.listProfessionals({
    activeOnly: true,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Novo paciente</h1>
      <PatientForm
        professionals={professionals.map((professional) => ({
          id: professional.id,
          name: professional.name,
        }))}
      />
    </div>
  );
}
