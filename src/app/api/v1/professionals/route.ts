import { NextResponse } from "next/server";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../_lib/error-response";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const activeOnly =
      new URL(request.url).searchParams.get("activeOnly") === "true";

    const repository = createProfessionalsRepository(
      getDb(),
      sessionUser.clinicId,
    );
    const professionals = await repository.listProfessionals({ activeOnly });

    return NextResponse.json({ professionals });
  } catch (error) {
    return errorResponse(error);
  }
}
