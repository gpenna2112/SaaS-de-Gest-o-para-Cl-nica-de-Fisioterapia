import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createEvolutionsRepository } from "@/db/repositories/evolutions-repository";
import { AttendeeNotRealizadaError, AttendeeRecordNotFoundError } from "@/db/repositories/evolutions-repository.errors";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { createEvolutionSchema } from "@/lib/validation/evolution";
import { requireSessionUser } from "@/modules/auth/session";
import { errorResponse } from "../../../_lib/error-response";
import { parseJsonBody } from "../../../_lib/parse-json-body";

/** Usada pelo painel da sessão para saber se já existe evolução (criar vs. editar). */
export async function GET(request: Request, { params }: { params: Promise<{ attendeeId: string }> }) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { attendeeId } = await params;

    const evolutionsRepository = createEvolutionsRepository(getDb(), sessionUser.clinicId);
    const evolution = await evolutionsRepository.getBySessionAttendee(attendeeId);

    return NextResponse.json({ evolution });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Registrar evolução após o atendimento (ADR-0019). A validação de que o
 * attendee existe e está `realizada` compõe com `scheduling-repository` na
 * própria rota — nenhum dos dois repositórios importa a tabela do outro
 * (ADR-0016).
 */
export async function POST(request: Request, { params }: { params: Promise<{ attendeeId: string }> }) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { attendeeId } = await params;
    const body = await parseJsonBody(request, createEvolutionSchema);

    const db = getDb();
    const schedulingRepository = createSchedulingRepository(db, sessionUser.clinicId);
    const evolutionsRepository = createEvolutionsRepository(db, sessionUser.clinicId);

    const attendee = await schedulingRepository.getAttendee(attendeeId);
    if (!attendee) {
      throw new AttendeeRecordNotFoundError(attendeeId);
    }
    if (attendee.status !== "realizada") {
      throw new AttendeeNotRealizadaError(attendeeId);
    }

    const evolution = await evolutionsRepository.createEvolution(
      { sessionAttendeeId: attendeeId, patientId: attendee.patientId, content: body.content },
      { type: "professional", professionalId: sessionUser.professionalId },
    );

    return NextResponse.json({ evolution }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
