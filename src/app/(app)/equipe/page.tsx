import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { RoomsEditor } from "@/components/rooms-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { TeamEditor } from "@/components/team-editor";
import { getSessionUser } from "@/modules/auth/session";

const ROLE_LABELS: Record<string, string> = {
  fisioterapeuta: "Fisioterapeuta",
  gestora: "Gestora",
};

export default async function EquipePage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  const db = getDb();
  const professionalsRepository = createProfessionalsRepository(db, sessionUser.clinicId);
  const roomsRepository = createRoomsRepository(db, sessionUser.clinicId);

  const [professionals, rooms] = await Promise.all([
    professionalsRepository.listProfessionals({}),
    roomsRepository.listRooms({}),
  ]);

  const isGestora = sessionUser.role === "gestora";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="sr-only">Equipe &amp; Salas</h1>
      {!isGestora ? (
        <p className="text-sm text-muted-foreground">
          Só gestoras podem cadastrar ou editar fisioterapeutas e salas. Você está vendo a lista em modo leitura.
        </p>
      ) : null}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Fisioterapeutas</h2>
        {isGestora ? (
          <TeamEditor
            professionals={professionals.map((professional) => ({
              id: professional.id,
              name: professional.name,
              email: professional.email,
              role: professional.role as "fisioterapeuta" | "gestora",
              active: professional.active,
            }))}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="flex flex-col divide-y divide-border">
              {professionals.map((professional) => (
                <li key={professional.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{professional.name}</span>
                    {!professional.active ? <StatusBadge tone="neutral">Inativo</StatusBadge> : null}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {ROLE_LABELS[professional.role] ?? professional.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Salas</h2>
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
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="flex flex-col divide-y divide-border">
              {rooms.map((room) => (
                <li key={room.id} className="flex items-center justify-between gap-4 px-4 py-3">
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
    </div>
  );
}
