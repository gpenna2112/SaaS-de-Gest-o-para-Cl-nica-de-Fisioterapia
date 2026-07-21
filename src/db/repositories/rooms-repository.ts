import { and, eq } from "drizzle-orm";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { auditLog, rooms } from "../schema";
import { DuplicateRoomNameError, RoomRecordNotFoundError } from "./rooms-repository.errors";

export type Room = typeof rooms.$inferSelect;
export type RoomType = "individual" | "pilates";

export interface Actor {
  type: "professional" | "patient_reply" | "system";
  professionalId?: string;
}

export interface ListRoomsFilter {
  activeOnly?: boolean;
}

export interface CreateRoomInput {
  name: string;
  type: RoomType;
  capacity: number;
}

export interface UpdateRoomInput {
  name?: string;
  type?: RoomType;
  capacity?: number;
}

/**
 * Tenant-scoped. Leitura já existia (ADR-0007); escrita adicionada para o
 * cadastro de sala deixar de depender de SQL manual — mesmo padrão de
 * `patients-repository.ts`/`professionals-repository.ts`. Reduzir
 * `capacity` abaixo do nº de participantes de sessões já existentes é
 * permitido de propósito: a validação de capacidade só roda no momento do
 * agendamento (ADR-0013), não retroativamente.
 */
export interface RoomsRepository {
  listRooms(filter: ListRoomsFilter, tx?: Tx): Promise<Room[]>;
  getRoom(roomId: string, tx?: Tx): Promise<Room | null>;
  createRoom(input: CreateRoomInput, actor: Actor, tx?: Tx): Promise<Room>;
  updateRoom(roomId: string, input: UpdateRoomInput, actor: Actor, tx?: Tx): Promise<Room>;
  deactivateRoom(roomId: string, actor: Actor, tx?: Tx): Promise<Room>;
  reactivateRoom(roomId: string, actor: Actor, tx?: Tx): Promise<Room>;
}

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function roomAuditSnapshot(room: Pick<Room, "name" | "type" | "capacity" | "active">) {
  return { name: room.name, type: room.type, capacity: room.capacity, active: room.active };
}

async function fetchRoomById(executor: QueryExecutor, clinicId: string, roomId: string) {
  const [room] = await executor
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.clinicId, clinicId)));
  return room;
}

async function assertNameAvailable(
  executor: QueryExecutor,
  clinicId: string,
  name: string,
  excludeRoomId?: string,
): Promise<void> {
  const existing = await executor
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.clinicId, clinicId), eq(rooms.name, name)));
  const conflicting = existing.find((row) => row.id !== excludeRoomId);
  if (conflicting) {
    throw new DuplicateRoomNameError(name);
  }
}

async function writeAuditLog(
  executor: QueryExecutor,
  clinicId: string,
  actor: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await executor.insert(auditLog).values({
    clinicId,
    actorId: actor.type === "professional" ? (actor.professionalId ?? null) : null,
    actorType: actor.type,
    action,
    entityType: "room",
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}

async function createRoomCore(
  executor: QueryExecutor,
  clinicId: string,
  input: CreateRoomInput,
  actor: Actor,
): Promise<Room> {
  await assertNameAvailable(executor, clinicId, input.name);

  const [inserted] = await executor
    .insert(rooms)
    .values({ clinicId, name: input.name, type: input.type, capacity: input.capacity })
    .returning();
  const room = assertRow(inserted, "Insert de sala não retornou linha");

  await writeAuditLog(executor, clinicId, actor, "room.created", room.id, null, roomAuditSnapshot(room));

  return room;
}

async function updateRoomCore(
  executor: QueryExecutor,
  clinicId: string,
  roomId: string,
  input: UpdateRoomInput,
  actor: Actor,
): Promise<Room> {
  const current = await fetchRoomById(executor, clinicId, roomId);
  if (!current) {
    throw new RoomRecordNotFoundError(roomId);
  }
  if (input.name && input.name !== current.name) {
    await assertNameAvailable(executor, clinicId, input.name, roomId);
  }

  const [updatedRow] = await executor
    .update(rooms)
    .set({
      name: input.name ?? current.name,
      type: input.type ?? current.type,
      capacity: input.capacity ?? current.capacity,
    })
    .where(and(eq(rooms.id, roomId), eq(rooms.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de sala não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "room.updated",
    updated.id,
    roomAuditSnapshot(current),
    roomAuditSnapshot(updated),
  );

  return updated;
}

async function setActiveCore(
  executor: QueryExecutor,
  clinicId: string,
  roomId: string,
  actor: Actor,
  active: boolean,
): Promise<Room> {
  const current = await fetchRoomById(executor, clinicId, roomId);
  if (!current) {
    throw new RoomRecordNotFoundError(roomId);
  }
  if (current.active === active) {
    return current;
  }

  const [updatedRow] = await executor
    .update(rooms)
    .set({ active })
    .where(and(eq(rooms.id, roomId), eq(rooms.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de ativação não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    active ? "room.reactivated" : "room.deactivated",
    updated.id,
    roomAuditSnapshot(current),
    roomAuditSnapshot(updated),
  );

  return updated;
}

export function createRoomsRepository(db: DbClient, clinicId: string): RoomsRepository {
  return {
    listRooms(filter, tx) {
      const executor = tx ?? db;
      const conditions = [eq(rooms.clinicId, clinicId)];
      if (filter.activeOnly) {
        conditions.push(eq(rooms.active, true));
      }
      return executor.select().from(rooms).where(and(...conditions));
    },

    async getRoom(roomId, tx) {
      const room = await fetchRoomById(tx ?? db, clinicId, roomId);
      return room ?? null;
    },

    createRoom(input, actor, externalTx) {
      if (externalTx) {
        return createRoomCore(externalTx, clinicId, input, actor);
      }
      return db.transaction((tx) => createRoomCore(tx, clinicId, input, actor));
    },

    updateRoom(roomId, input, actor, externalTx) {
      if (externalTx) {
        return updateRoomCore(externalTx, clinicId, roomId, input, actor);
      }
      return db.transaction((tx) => updateRoomCore(tx, clinicId, roomId, input, actor));
    },

    deactivateRoom(roomId, actor, externalTx) {
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, roomId, actor, false);
      }
      return db.transaction((tx) => setActiveCore(tx, clinicId, roomId, actor, false));
    },

    reactivateRoom(roomId, actor, externalTx) {
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, roomId, actor, true);
      }
      return db.transaction((tx) => setActiveCore(tx, clinicId, roomId, actor, true));
    },
  };
}
