import { NextResponse } from "next/server";
import { createNotificationsRepository } from "@/db/repositories/notifications-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { addAttendeeSchema } from "@/lib/validation/session-attendee";
import { requireSessionUser } from "@/modules/auth/session";
import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../../../_lib/error-response";
import { parseJsonBody } from "../../../_lib/parse-json-body";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { sessionId } = await params;
    const body = await parseJsonBody(request, addAttendeeSchema);

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

    const result = await schedulingService.addAttendee(
      sessionId,
      body.patientId,
      { type: "professional", professionalId: sessionUser.professionalId },
    );

    return NextResponse.json(
      {
        attendee: {
          id: result.attendee.id,
          sessionId: result.attendee.sessionId,
          patientId: result.attendee.patientId,
          status: result.attendee.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
