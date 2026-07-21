"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage, patch, post } from "@/lib/api-client";
import { createRoomSchema } from "@/lib/validation/room";

export interface RoomItem {
  id: string;
  name: string;
  type: "individual" | "pilates";
  capacity: number;
  active: boolean;
}

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
  const [isToggling, startToggling] = useTransition();

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

  function handleToggleActive() {
    startToggling(async () => {
      try {
        await patch(`/api/v1/rooms/${room.id}`, { active: !room.active });
        onChanged();
      } catch {
        // idem professional-row: erro silencioso, botão só volta ao normal.
      }
    });
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
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{room.name}</span>
        {!room.active ? <StatusBadge tone="neutral">Inativa</StatusBadge> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {room.capacity} {room.capacity > 1 ? "vagas" : "vaga"}
        </span>
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-primary hover:underline">
          Editar
        </button>
        <button
          type="button"
          disabled={isToggling}
          onClick={handleToggleActive}
          className="text-sm text-danger hover:underline disabled:opacity-50"
        >
          {room.active ? "Desativar" : "Reativar"}
        </button>
      </div>
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
