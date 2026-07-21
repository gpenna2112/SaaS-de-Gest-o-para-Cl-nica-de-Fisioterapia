import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { updateProfessionalSchema } from "@/lib/validation/professional";
import { requireRole } from "@/modules/auth/session";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ professionalId: string }> }) {
  try {
    const sessionUser = await requireRole(request.headers, ["gestora"]);
    const { professionalId } = await params;
    const body = await parseJsonBody(request, updateProfessionalSchema);
    const actor = { type: "professional" as const, professionalId: sessionUser.professionalId };

    const repository = createProfessionalsRepository(getDb(), sessionUser.clinicId);

    const { active, ...fields } = body;
    let professional = await repository.getProfessional(professionalId);
    if (!professional) {
      return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
    }

    if (fields.name !== undefined || fields.email !== undefined || fields.role !== undefined) {
      professional = await repository.updateProfessional(professionalId, fields, actor);
    }
    if (active === false) {
      professional = await repository.deactivateProfessional(professionalId, actor);
    } else if (active === true) {
      professional = await repository.reactivateProfessional(professionalId, actor);
    }

    return NextResponse.json({ professional });
  } catch (error) {
    return errorResponse(error);
  }
}
