import { NextResponse } from "next/server";
import { createNotificationsRepository } from "@/db/repositories/notifications-repository";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { createSessionSchema } from "@/lib/validation/session";
import { requireSessionUser } from "@/modules/auth/session";
import { dayRangeInSaoPaulo } from "@/modules/scheduling/day-range";
import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { toSessionViews } from "@/modules/scheduling/session-view";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../_lib/error-response";
import { parseJsonBody } from "../_lib/parse-json-body";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const searchParams = new URL(request.url).searchParams;

    const date = searchParams.get("date");
    if (!date || !DATE_PATTERN.test(date)) {
      return NextResponse.json(
        { error: "Parâmetro 'date' é obrigatório no formato AAAA-MM-DD." },
        { status: 400 },
      );
    }

    let range: { start: Date; end: Date };
    try {
      range = dayRangeInSaoPaulo(date);
    } catch {
      return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    }

    const roomId = searchParams.get("roomId") ?? undefined;
    const professionalId = searchParams.get("professionalId") ?? undefined;

    const db = getDb();
    const schedulingRepository = createSchedulingRepository(
      db,
      sessionUser.clinicId,
    );
    const patientsRepository = createPatientsRepository(
      db,
      sessionUser.clinicId,
    );

    const sessionsWithAttendees = await schedulingRepository.listSessions({
      rangeStart: range.start,
      rangeEnd: range.end,
      roomId,
      professionalId,
    });

    // Repositório de scheduling não conhece patients (limite de módulo) —
    // resolve nomes aqui, na camada de rota, compondo os dois repositórios.
    const patients = await patientsRepository.listPatients({});
    const patientNameById = new Map(
      patients.map((patient) => [patient.id, patient.name]),
    );

    return NextResponse.json({
      sessions: toSessionViews(sessionsWithAttendees, patientNameById),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const body = await parseJsonBody(request, createSessionSchema);

    const db = getDb();
    const schedulingRepository = createSchedulingRepository(
      db,
      sessionUser.clinicId,
    );
    const notificationsRepository = createNotificationsRepository(
      db,
      sessionUser.clinicId,
    );
    const schedulingService = createSchedulingService(
      db,
      schedulingRepository,
      notificationsRepository,
    );

    const result = await schedulingService.createSession(body, {
      type: "professional",
      professionalId: sessionUser.professionalId,
    });

    return NextResponse.json(
      {
        session: {
          id: result.session.id,
          professionalId: result.session.professionalId,
          roomId: result.session.roomId,
          scheduledStart: result.session.scheduledStart,
          scheduledEnd: result.session.scheduledEnd,
        },
        attendees: result.attendees.map((attendee) => ({
          id: attendee.id,
          patientId: attendee.patientId,
          status: attendee.status,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
