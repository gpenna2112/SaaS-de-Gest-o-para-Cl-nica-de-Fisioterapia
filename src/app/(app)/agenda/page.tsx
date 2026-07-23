import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createClinicsRepository } from "@/db/repositories/clinics-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { AgendaView } from "@/components/agenda-view";
import { getSessionUser } from "@/modules/auth/session";
import { dayRangeInSaoPaulo, todayInSaoPaulo } from "@/modules/scheduling/day-range";
import { toSessionViews } from "@/modules/scheduling/session-view";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const { date: rawDate } = await searchParams;
  const date = rawDate && DATE_PATTERN.test(rawDate) ? rawDate : todayInSaoPaulo();

  const db = getDb();
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);
  const schedulingRepository = createSchedulingRepository(db, sessionUser.clinicId);
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const professionalsRepository = createProfessionalsRepository(db, sessionUser.clinicId);
  const clinicsRepository = createClinicsRepository(db, sessionUser.clinicId);

  const { start, end } = dayRangeInSaoPaulo(date);

  const [rooms, sessionsWithAttendees, cancelledAttendeesCount, allPatients, activePatients, professionals, clinic] =
    await Promise.all([
      roomsRepository.listRooms({ activeOnly: true }),
      schedulingRepository.listSessions({ rangeStart: start, rangeEnd: end }),
      // Contagem separada: `listSessions` só traz `sessions.status = 'ativa'`
      // (ADR-0015), então uma turma cancelada por completo não aparece ali.
      schedulingRepository.countCancelledAttendees({ rangeStart: start, rangeEnd: end }),
      // Nome de attendee precisa resolver mesmo para paciente desativado depois
      // (desativar não cancela sessões existentes, ver CLAUDE.md/patients/README).
      patientsRepository.listPatients({}),
      // Selecionável (criar sessão / adicionar paciente) é só quem está ativo.
      patientsRepository.listPatients({ activeOnly: true }),
      professionalsRepository.listProfessionals({ activeOnly: true }),
      clinicsRepository.getClinic(),
    ]);

  const patientNameById = new Map(allPatients.map((patient) => [patient.id, patient.name]));
  const sessions = toSessionViews(sessionsWithAttendees, patientNameById);

  return (
    <AgendaView
      date={date}
      rooms={rooms.map((room) => ({ id: room.id, name: room.name, type: room.type, capacity: room.capacity }))}
      sessions={sessions}
      slotMinutes={clinic?.defaultSessionDurationMinutes ?? 50}
      professionals={professionals.map((professional) => ({ id: professional.id, name: professional.name }))}
      patients={activePatients.map((patient) => ({ id: patient.id, name: patient.name }))}
      cancelledCount={cancelledAttendeesCount}
      currentProfessionalId={sessionUser.professionalId}
    />
  );
}
