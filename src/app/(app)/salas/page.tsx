import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { RoomsEditor } from "@/components/rooms-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSessionUser } from "@/modules/auth/session";

export default async function SalasPage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const roomsRepository = createRoomsRepository(getDb(), sessionUser.clinicId);
  const rooms = await roomsRepository.listRooms({});

  const isGestora = sessionUser.role === "gestora";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-lg font-bold tracking-tight">Salas</h1>
      {!isGestora ? (
        <p className="text-sm text-muted-foreground">
          Só gestoras podem cadastrar ou editar salas. Você está vendo a lista em modo leitura.
        </p>
      ) : null}
      {isGestora ? (
        <RoomsEditor
          rooms={rooms.map((room) => ({
            id: room.id,
            name: room.name,
            type: room.type as "individual" | "pilates",
            capacity: room.capacity,
            active: room.active,
          }))}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-xs">
          <ul className="flex flex-col divide-y divide-border">
            {rooms.map((room) => (
              <li key={room.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{room.name}</span>
                  {!room.active ? <StatusBadge tone="neutral">Inativa</StatusBadge> : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {room.capacity} {room.capacity > 1 ? "vagas" : "vaga"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
