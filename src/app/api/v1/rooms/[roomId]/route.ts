import { NextResponse } from "next/server";
import { getDb } from "@/app/_lib/db";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { updateRoomSchema } from "@/lib/validation/room";
import { requireRole } from "@/modules/auth/session";
import { errorResponse } from "../../_lib/error-response";
import { parseJsonBody } from "../../_lib/parse-json-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const sessionUser = await requireRole(request.headers, ["gestora"]);
    const { roomId } = await params;
    const body = await parseJsonBody(request, updateRoomSchema);
    const actor = { type: "professional" as const, professionalId: sessionUser.professionalId };

    const repository = createRoomsRepository(getDb(), sessionUser.clinicId);

    const { active, ...fields } = body;
    let room = await repository.getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (fields.name !== undefined || fields.type !== undefined || fields.capacity !== undefined) {
      room = await repository.updateRoom(roomId, fields, actor);
    }
    if (active === false) {
      room = await repository.deactivateRoom(roomId, actor);
    } else if (active === true) {
      room = await repository.reactivateRoom(roomId, actor);
    }

    return NextResponse.json({ room });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const sessionUser = await requireRole(request.headers, ["gestora"]);
    const { roomId } = await params;
    const actor = { type: "professional" as const, professionalId: sessionUser.professionalId };

    const repository = createRoomsRepository(getDb(), sessionUser.clinicId);
    const room = await repository.getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    await repository.deleteRoom(roomId, actor);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
