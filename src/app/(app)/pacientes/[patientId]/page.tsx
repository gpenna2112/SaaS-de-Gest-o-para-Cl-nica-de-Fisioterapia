import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createEvolutionsRepository } from "@/db/repositories/evolutions-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { PatientEditForm } from "@/components/patient-edit-form";
import { PatientHistory } from "@/components/patient-history";
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
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);
  const schedulingRepository = createSchedulingRepository(db, sessionUser.clinicId);
  const evolutionsRepository = createEvolutionsRepository(db, sessionUser.clinicId);

  const [patient, professionals, rooms, attendanceHistory, evolutions] = await Promise.all([
    patientsRepository.getPatient(patientId),
    professionalsRepository.listProfessionals({}),
    roomsRepository.listRooms({}),
    schedulingRepository.listAttendanceHistoryForPatient(patientId),
    evolutionsRepository.listByPatient(patientId),
  ]);

  if (!patient) {
    notFound();
  }

  const professionalNameById = new Map(professionals.map((professional) => [professional.id, professional.name]));
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));

  return (
    <div className="flex flex-col gap-8">
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
      <PatientHistory
        attendanceHistory={attendanceHistory.map((entry) => ({
          attendeeId: entry.attendeeId,
          status: entry.status,
          scheduledStart: entry.scheduledStart,
          scheduledEnd: entry.scheduledEnd,
          roomName: roomNameById.get(entry.roomId) ?? "—",
          professionalName: professionalNameById.get(entry.professionalId) ?? "—",
        }))}
        evolutions={evolutions.map((evolution) => ({
          id: evolution.id,
          content: evolution.content,
          createdAt: evolution.createdAt,
          professionalName: professionalNameById.get(evolution.professionalId) ?? "—",
        }))}
      />
    </div>
  );
}
