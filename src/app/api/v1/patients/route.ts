import { NextResponse } from "next/server";
import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createPatientSchema } from "@/lib/validation/patient";
import { requireSessionUser } from "@/modules/auth/session";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../_lib/error-response";
import { parseJsonBody } from "../_lib/parse-json-body";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const searchParams = new URL(request.url).searchParams;
    const professionalId = searchParams.get("professionalId") ?? undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";

    const repository = createPatientsRepository(getDb(), sessionUser.clinicId);
    const patients = await repository.listPatients({
      professionalId,
      activeOnly,
    });

    return NextResponse.json({ patients });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const body = await parseJsonBody(request, createPatientSchema);

    const repository = createPatientsRepository(getDb(), sessionUser.clinicId);
    const patient = await repository.createPatient(body, {
      type: "professional",
      professionalId: sessionUser.professionalId,
    });

    return NextResponse.json({ patient }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
