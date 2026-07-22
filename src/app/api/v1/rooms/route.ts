import { NextResponse } from "next/server";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { createRoomSchema } from "@/lib/validation/room";
import { requireRole, requireSessionUser } from "@/modules/auth/session";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../_lib/error-response";
import { parseJsonBody } from "../_lib/parse-json-body";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser(request.headers);
    const activeOnly =
      new URL(request.url).searchParams.get("activeOnly") === "true";

    const repository = createRoomsRepository(getDb(), sessionUser.clinicId);
    const rooms = await repository.listRooms({ activeOnly });

    return NextResponse.json({ rooms });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Cadastro de sala é ação de gestão, restrita a `gestora` (mesmo racional de professionals). */
export async function POST(request: Request) {
  try {
    const sessionUser = await requireRole(request.headers, ["gestora"]);
    const body = await parseJsonBody(request, createRoomSchema);

    const repository = createRoomsRepository(getDb(), sessionUser.clinicId);
    const room = await repository.createRoom(body, {
      type: "professional",
      professionalId: sessionUser.professionalId,
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
