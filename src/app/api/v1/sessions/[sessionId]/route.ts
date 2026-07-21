import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createNotificationsRepository } from "@/db/repositories/notifications-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { rescheduleSessionSchema } from "@/lib/validation/session";
import { requireSessionUser } from "@/modules/auth/session";
import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { sessionId } = await params;
    const body = await parseJsonBody(request, rescheduleSessionSchema);

    const db = getDb();
    const schedulingRepository = createSchedulingRepository(db, sessionUser.clinicId);
    const notificationsRepository = createNotificationsRepository(db, sessionUser.clinicId);
    const schedulingService = createSchedulingService(db, schedulingRepository, notificationsRepository);

    const session = await schedulingService.rescheduleSession(
      { sessionId, roomId: body.roomId, scheduledStart: body.scheduledStart, scheduledEnd: body.scheduledEnd },
      { type: "professional", professionalId: sessionUser.professionalId },
    );

    return NextResponse.json({
      session: {
        id: session.id,
        professionalId: session.professionalId,
        roomId: session.roomId,
        scheduledStart: session.scheduledStart,
        scheduledEnd: session.scheduledEnd,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
