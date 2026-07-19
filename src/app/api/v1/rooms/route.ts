import { NextResponse } from "next/server";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { getDb } from "@/app/_lib/db";
import { errorResponse } from "../_lib/error-response";

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
