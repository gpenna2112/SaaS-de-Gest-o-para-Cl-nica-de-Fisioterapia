"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { del, getApiErrorMessage, patch, post } from "@/lib/api-client";
import { createRoomSchema } from "@/lib/validation/room";

export interface RoomItem {
  id: string;
  name: string;
  type: "individual" | "pilates";
  capacity: number;
  active: boolean;
}

const ROOM_TYPE_LABELS: Record<RoomItem["type"], string> = {
  individual: "Individual",
  pilates: "Pilates",
};

function NewRoomForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"individual" | "pilates">("individual");
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = createRoomSchema.safeParse({ name, type, capacity });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    startTransition(async () => {
      try {
        await post("/api/v1/rooms", result.data);
        setName("");
        setType("individual");
        setCapacity(1);
        setOpen(false);
        onCreated();
      } catch (err) {
        setError(getApiErrorMessage(err, "Não foi possível cadastrar. Tente novamente."));
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Nova sala
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} />
      <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
        <option value="individual">Individual</option>
        <option value="pilates">Pilates</option>
      </Select>
      <Input
        type="number"
        min={1}
        placeholder="Capacidade"
        value={capacity}
        onChange={(event) => setCapacity(Number(event.target.value))}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Cadastrar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function RoomRow({ room, onChanged }: { room: RoomItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [type, setType] = useState(room.type);
  const [capacity, setCapacity] = useState(room.capacity);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isToggling, setIsToggling] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSave() {
    setError(null);
    startSaving(async () => {
      try {
        await patch(`/api/v1/rooms/${room.id}`, { name, type, capacity });
        setEditing(false);
        onChanged();
      } catch (err) {
        setError(getApiErrorMessage(err, "Não foi possível salvar. Tente novamente."));
      }
    });
  }

  async function handleReactivate() {
    setError(null);
    setIsToggling(true);
    try {
      await patch(`/api/v1/rooms/${room.id}`, { active: true });
      onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível reativar. Tente novamente."));
    } finally {
      setIsToggling(false);
    }
  }

  // Não usa `startTransition`: o ConfirmDialog precisa que a promise
  // rejeite para saber que deve permanecer aberto. Antes o erro de
  // desativação era engolido silenciosamente — agora aparece em `error`.
  async function handleConfirmDeactivate() {
    setError(null);
    setIsToggling(true);
    try {
      await patch(`/api/v1/rooms/${room.id}`, { active: false });
      onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível desativar. Tente novamente."));
      throw err;
    } finally {
      setIsToggling(false);
    }
  }

  // Mesmo racional de `handleConfirmDeactivate`: sem `startTransition`, o
  // ConfirmDialog precisa que a promise rejeite pra saber que deve
  // permanecer aberto e mostrar o erro (ex.: sala com sessões).
  async function handleConfirmDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await del(`/api/v1/rooms/${room.id}`);
      onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível excluir. Tente novamente."));
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          <option value="individual">Individual</option>
          <option value="pilates">Pilates</option>
        </Select>
        <Input
          type="number"
          min={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value))}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{room.name}</span>
          <span className="text-xs text-muted-foreground">{ROOM_TYPE_LABELS[room.type]}</span>
          {!room.active ? <StatusBadge tone="neutral">Inativa</StatusBadge> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {room.capacity} {room.capacity > 1 ? "vagas" : "vaga"}
          </span>
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-primary hover:underline">
            Editar
          </button>
          <Button
            type="button"
            variant={room.active ? "danger" : "secondary"}
            disabled={isToggling}
            onClick={() => (room.active ? setConfirmDeactivateOpen(true) : handleReactivate())}
            className="min-h-8 px-3 py-1 text-xs"
          >
            {room.active ? "Desativar" : "Reativar"}
          </Button>
          {!room.active ? (
            <Button
              type="button"
              variant="danger"
              disabled={isDeleting}
              onClick={() => setConfirmDeleteOpen(true)}
              className="min-h-8 px-3 py-1 text-xs"
            >
              Excluir
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ConfirmDialog
        open={confirmDeactivateOpen}
        onOpenChange={setConfirmDeactivateOpen}
        title={`Desativar ${room.name}?`}
        description="Impede novos agendamentos nesta sala. Sessões já existentes não são afetadas."
        confirmLabel="Desativar"
        isConfirming={isToggling}
        onConfirm={handleConfirmDeactivate}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Excluir ${room.name}?`}
        description="Remove o cadastro definitivamente. Só é possível se esta sala nunca teve sessão vinculada — caso tenha, a exclusão falha e você pode manter só desativada."
        confirmLabel="Excluir"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </li>
  );
}

export function RoomsEditor({ rooms }: { rooms: RoomItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <ul className="flex flex-col divide-y divide-border">
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} onChanged={refresh} />
          ))}
        </ul>
      </div>
      <NewRoomForm onCreated={refresh} />
    </div>
  );
}
