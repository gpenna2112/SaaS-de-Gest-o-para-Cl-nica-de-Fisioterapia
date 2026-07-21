import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { updatePatientSchema } from "@/lib/validation/patient";
import { requireSessionUser } from "@/modules/auth/session";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { patientId } = await params;
    const body = await parseJsonBody(request, updatePatientSchema);
    const actor = { type: "professional" as const, professionalId: sessionUser.professionalId };

    const repository = createPatientsRepository(getDb(), sessionUser.clinicId);

    const { active, ...fields } = body;
    let patient = await repository.getPatient(patientId);
    if (!patient) {
      return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
    }

    if (fields.name !== undefined || fields.phone !== undefined || fields.primaryProfessionalId !== undefined) {
      patient = await repository.updatePatient(patientId, fields, actor);
    }
    if (active === false) {
      patient = await repository.deactivatePatient(patientId, actor);
    } else if (active === true) {
      patient = await repository.reactivatePatient(patientId, actor);
    }

    return NextResponse.json({ patient });
  } catch (error) {
    return errorResponse(error);
  }
}
