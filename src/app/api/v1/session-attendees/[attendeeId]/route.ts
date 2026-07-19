import { NextResponse } from "next/server";
import { createNotificationsRepository } from "@/db/repositories/notifications-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { updateAttendeeStatusSchema } from "@/lib/validation/session-attendee";
import { requireSessionUser } from "@/modules/auth/session";
import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attendeeId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { attendeeId } = await params;
    const body = await parseJsonBody(request, updateAttendeeStatusSchema);

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

    const attendee = await schedulingService.updateAttendeeStatus(
      attendeeId,
      body.status,
      {
        type: "professional",
        professionalId: sessionUser.professionalId,
      },
    );

    return NextResponse.json({
      attendee: {
        id: attendee.id,
        sessionId: attendee.sessionId,
        patientId: attendee.patientId,
        status: attendee.status,
        confirmedAt: attendee.confirmedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
