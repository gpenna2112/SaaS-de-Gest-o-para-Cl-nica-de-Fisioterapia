import { and, eq } from "drizzle-orm";
import type { DbClient, Tx } from "../client";
import { rooms } from "../schema";

export type Room = typeof rooms.$inferSelect;

export interface ListRoomsFilter {
  activeOnly?: boolean;
}

/** Tenant-scoped, só leitura (ADR-0007) — mesmo padrão de professionals-repository.ts. */
export interface RoomsRepository {
  listRooms(filter: ListRoomsFilter, tx?: Tx): Promise<Room[]>;
}

export function createRoomsRepository(
  db: DbClient,
  clinicId: string,
): RoomsRepository {
  return {
    listRooms(filter, tx) {
      const executor = tx ?? db;
      const conditions = [eq(rooms.clinicId, clinicId)];
      if (filter.activeOnly) {
        conditions.push(eq(rooms.active, true));
      }
      return executor
        .select()
        .from(rooms)
        .where(and(...conditions));
    },
  };
}
