import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
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

  const professionalsRepository = createProfessionalsRepository(getDb(), sessionUser.clinicId);
  const professionals = await professionalsRepository.listProfessionals({});

  const isGestora = sessionUser.role === "gestora";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-lg font-bold tracking-tight">Fisioterapeutas</h1>
      {!isGestora ? (
        <p className="text-sm text-muted-foreground">
          Só gestoras podem cadastrar ou editar fisioterapeutas. Você está vendo a lista em modo leitura.
        </p>
      ) : null}
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
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-xs">
          <ul className="flex flex-col divide-y divide-border">
            {professionals.map((professional) => (
              <li key={professional.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
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
  );
}
