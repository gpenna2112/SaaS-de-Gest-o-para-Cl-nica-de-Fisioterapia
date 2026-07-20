import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createClinicsRepository } from "@/db/repositories/clinics-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { AgendaGrid } from "@/components/agenda-grid";
import { DateNav } from "@/components/date-nav";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/modules/auth/session";
import {
  dayRangeInSaoPaulo,
  todayInSaoPaulo,
} from "@/modules/scheduling/day-range";
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
  const date =
    rawDate && DATE_PATTERN.test(rawDate) ? rawDate : todayInSaoPaulo();

  const db = getDb();
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);
  const schedulingRepository = createSchedulingRepository(
    db,
    sessionUser.clinicId,
  );
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const clinicsRepository = createClinicsRepository(db, sessionUser.clinicId);

  const { start, end } = dayRangeInSaoPaulo(date);

  const [rooms, sessionsWithAttendees, patients, clinic] = await Promise.all([
    roomsRepository.listRooms({ activeOnly: true }),
    schedulingRepository.listSessions({ rangeStart: start, rangeEnd: end }),
    patientsRepository.listPatients({}),
    clinicsRepository.getClinic(),
  ]);

  const patientNameById = new Map(
    patients.map((patient) => [patient.id, patient.name]),
  );
  const sessions = toSessionViews(sessionsWithAttendees, patientNameById);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Agenda</h1>
        <LinkButton href={`/agenda/nova?date=${date}`}>Nova sessão</LinkButton>
      </div>
      <DateNav date={date} />
      <AgendaGrid
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        sessions={sessions}
        slotMinutes={clinic?.defaultSessionDurationMinutes ?? 50}
      />
    </div>
  );
}
