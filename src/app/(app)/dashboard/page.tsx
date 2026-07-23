import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createClinicsRepository } from "@/db/repositories/clinics-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { DashboardView } from "@/components/dashboard-view";
import { getSessionUser } from "@/modules/auth/session";
import { buildDashboardSnapshot } from "@/modules/scheduling/dashboard-view";
import {
  dayRangeInSaoPaulo,
  minutesSinceMidnightSaoPaulo,
  todayInSaoPaulo,
} from "@/modules/scheduling/day-range";
import { toSessionViews } from "@/modules/scheduling/session-view";

export default async function DashboardPage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const date = todayInSaoPaulo();
  const db = getDb();
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);
  const schedulingRepository = createSchedulingRepository(db, sessionUser.clinicId);
  const patientsRepository = createPatientsRepository(db, sessionUser.clinicId);
  const professionalsRepository = createProfessionalsRepository(db, sessionUser.clinicId);
  const clinicsRepository = createClinicsRepository(db, sessionUser.clinicId);

  const { start, end } = dayRangeInSaoPaulo(date);

  // Mesmos 6 dados que /agenda já busca para o dia — o dashboard não faz
  // nenhuma query nova, só reorganiza o que já existe (ver dashboard-view.ts).
  const [rooms, sessionsWithAttendees, cancelledAttendeesCount, allPatients, professionals, clinic] =
    await Promise.all([
      roomsRepository.listRooms({ activeOnly: true }),
      schedulingRepository.listSessions({ rangeStart: start, rangeEnd: end }),
      schedulingRepository.countCancelledAttendees({ rangeStart: start, rangeEnd: end }),
      patientsRepository.listPatients({}),
      professionalsRepository.listProfessionals({ activeOnly: true }),
      clinicsRepository.getClinic(),
    ]);

  const patientNameById = new Map(allPatients.map((patient) => [patient.id, patient.name]));
  const sessions = toSessionViews(sessionsWithAttendees, patientNameById);
  const slotMinutes = clinic?.defaultSessionDurationMinutes ?? 50;

  const snapshot = buildDashboardSnapshot({
    sessions,
    rooms: rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity })),
    professionals: professionals.map((professional) => ({ id: professional.id, name: professional.name })),
    now: new Date(),
    slotMinutes,
    cancelledCount: cancelledAttendeesCount,
  });

  const now = new Date();
  const hour = Math.floor(minutesSinceMidnightSaoPaulo(now) / 60);
  const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = sessionUser.name.trim().split(/\s+/)[0];
  const greeting = `${period}, ${firstName}!`;

  const referenceInstant = new Date(`${date}T12:00:00-03:00`);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(referenceInstant);
  const weekdayLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  }).format(referenceInstant);

  return (
    <DashboardView
      snapshot={snapshot}
      dateLabel={dateLabel}
      weekdayLabel={weekdayLabel}
      date={date}
      greeting={greeting}
    />
  );
}
