import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createEvolutionsRepository } from "@/db/repositories/evolutions-repository";
import { updateEvolutionSchema } from "@/lib/validation/evolution";
import { requireSessionUser } from "@/modules/auth/session";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ evolutionId: string }> }) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const { evolutionId } = await params;
    const body = await parseJsonBody(request, updateEvolutionSchema);

    const evolutionsRepository = createEvolutionsRepository(getDb(), sessionUser.clinicId);
    const evolution = await evolutionsRepository.updateEvolution(evolutionId, body, {
      type: "professional",
      professionalId: sessionUser.professionalId,
    });

    return NextResponse.json({ evolution });
  } catch (error) {
    return errorResponse(error);
  }
}
