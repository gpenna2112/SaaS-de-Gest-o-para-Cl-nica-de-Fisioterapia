import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createClinicsRepository } from "@/db/repositories/clinics-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { SessionForm } from "@/components/session-form";
import { getSessionUser } from "@/modules/auth/session";
import { todayInSaoPaulo } from "@/modules/scheduling/day-range";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const { date: rawDate } = await searchParams;
  const initialDate = rawDate && DATE_PATTERN.test(rawDate) ? rawDate : todayInSaoPaulo();

  const db = getDb();
  const professionalsRepository = createProfessionalsRepository(db, sessionUser.clinicId);
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const clinicsRepository = createClinicsRepository(db, sessionUser.clinicId);

  const [professionals, rooms, patients, clinic] = await Promise.all([
    professionalsRepository.listProfessionals({ activeOnly: true }),
    roomsRepository.listRooms({ activeOnly: true }),
    patientsRepository.listPatients({ activeOnly: true }),
    clinicsRepository.getClinic(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Nova sessão</h1>
      <SessionForm
        professionals={professionals.map((professional) => ({ id: professional.id, name: professional.name }))}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity }))}
        patients={patients.map((patient) => ({ id: patient.id, name: patient.name }))}
        defaultDurationMinutes={clinic?.defaultSessionDurationMinutes ?? 50}
        initialDate={initialDate}
      />
    </div>
  );
}
