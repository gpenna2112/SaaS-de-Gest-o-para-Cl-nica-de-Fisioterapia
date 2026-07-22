import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, professionals, rooms } from "../schema";
import { createRoomsRepository } from "./rooms-repository";
import { DuplicateRoomNameError, RoomRecordNotFoundError } from "./rooms-repository.errors";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

interface Fixture {
  clinicId: string;
  otherClinicId: string;
  actorProfessionalId: string;
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db
    .insert(clinics)
    .values({ name: `Rooms Test Clinic ${suffix}` })
    .returning();
  const [otherClinic] = await db
    .insert(clinics)
    .values({ name: `Rooms Other Clinic ${suffix}` })
    .returning();
  // Ator na "outra" clínica de propósito — `audit_log.actor_id` exige uma
  // linha real de `professionals` (FK), sem contaminar a clínica sob teste.
  const [actor] = await db
    .insert(professionals)
    .values({ clinicId: otherClinic!.id, name: "Gestora Atriz", email: `atriz-${suffix}@test.local`, role: "gestora" })
    .returning();
  return { clinicId: clinic!.id, otherClinicId: otherClinic!.id, actorProfessionalId: actor!.id };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("RoomsRepository", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
  });

  afterEach(async () => {
    await cleanupClinic(fixture.clinicId);
    await cleanupClinic(fixture.otherClinicId);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("lista só salas da própria clínica, nunca de outra", async () => {
    const suffix = randomUUID();
    await db
      .insert(rooms)
      .values({
        clinicId: fixture.clinicId,
        name: `Sala A ${suffix}`,
        type: "individual",
        capacity: 1,
      });
    await db
      .insert(rooms)
      .values({
        clinicId: fixture.otherClinicId,
        name: `Sala Outra Clínica ${suffix}`,
        type: "individual",
        capacity: 1,
      });

    const repo = createRoomsRepository(db, fixture.clinicId);
    const result = await repo.listRooms({});

    expect(result.map((r) => r.name)).toEqual([`Sala A ${suffix}`]);
  });

  it("activeOnly filtra salas inativas", async () => {
    const suffix = randomUUID();
    await db
      .insert(rooms)
      .values({
        clinicId: fixture.clinicId,
        name: `Sala Ativa ${suffix}`,
        type: "individual",
        capacity: 1,
      });
    await db.insert(rooms).values({
      clinicId: fixture.clinicId,
      name: `Sala Inativa ${suffix}`,
      type: "individual",
      capacity: 1,
      active: false,
    });

    const repo = createRoomsRepository(db, fixture.clinicId);
    const result = await repo.listRooms({ activeOnly: true });

    expect(result.map((r) => r.name)).toEqual([`Sala Ativa ${suffix}`]);
  });

  it("sem activeOnly retorna ativas e inativas", async () => {
    const suffix = randomUUID();
    await db
      .insert(rooms)
      .values({
        clinicId: fixture.clinicId,
        name: `Sala Ativa2 ${suffix}`,
        type: "pilates",
        capacity: 3,
      });
    await db.insert(rooms).values({
      clinicId: fixture.clinicId,
      name: `Sala Inativa2 ${suffix}`,
      type: "individual",
      capacity: 1,
      active: false,
    });

    const repo = createRoomsRepository(db, fixture.clinicId);
    const result = await repo.listRooms({});

    expect(result).toHaveLength(2);
  });

  it("createRoom cria o registro e grava audit_log", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();

    const created = await repo.createRoom({ name: `Sala Nova ${suffix}`, type: "individual", capacity: 1 }, actor);

    expect(created.active).toBe(true);
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(logs.some((entry) => entry.action === "room.created")).toBe(true);
  });

  it("createRoom rejeita nome já usado na mesma clínica", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const name = `Sala Dup ${suffix}`;
    await repo.createRoom({ name, type: "individual", capacity: 1 }, actor);

    await expect(repo.createRoom({ name, type: "individual", capacity: 1 }, actor)).rejects.toBeInstanceOf(
      DuplicateRoomNameError,
    );
  });

  it("duas criações concorrentes com o mesmo nome: só uma sucede, a outra recebe DuplicateRoomNameError", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const name = `Sala Race ${suffix}`;

    const results = await Promise.allSettled([
      repo.createRoom({ name, type: "individual", capacity: 1 }, actor),
      repo.createRoom({ name, type: "individual", capacity: 1 }, actor),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateRoomNameError);

    const rowsInDb = await db.select().from(rooms).where(eq(rooms.name, name));
    expect(rowsInDb).toHaveLength(1);
  });

  it("duas atualizações concorrentes para o mesmo nome: só uma sucede, a outra recebe DuplicateRoomNameError", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const target = `Sala Update Race Target ${suffix}`;
    const roomA = await repo.createRoom({ name: `Sala Update Race A ${suffix}`, type: "individual", capacity: 1 }, actor);
    const roomB = await repo.createRoom({ name: `Sala Update Race B ${suffix}`, type: "individual", capacity: 1 }, actor);

    const results = await Promise.allSettled([
      repo.updateRoom(roomA.id, { name: target }, actor),
      repo.updateRoom(roomB.id, { name: target }, actor),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateRoomNameError);

    const rowsInDb = await db.select().from(rooms).where(eq(rooms.name, target));
    expect(rowsInDb).toHaveLength(1);
  });

  it("updateRoom atualiza capacidade e grava audit_log com before/after", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const created = await repo.createRoom({ name: `Sala Cap ${suffix}`, type: "individual", capacity: 1 }, actor);

    const updated = await repo.updateRoom(created.id, { capacity: 3, type: "pilates" }, actor);

    expect(updated.capacity).toBe(3);
    expect(updated.type).toBe("pilates");
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    const updateLog = logs.find((entry) => entry.action === "room.updated");
    expect((updateLog?.before as { capacity: number } | null)?.capacity).toBe(1);
    expect((updateLog?.after as { capacity: number } | null)?.capacity).toBe(3);
  });

  it("updateRoom com id inexistente lança RoomRecordNotFoundError", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    await expect(repo.updateRoom(randomUUID(), { capacity: 2 }, actor)).rejects.toBeInstanceOf(
      RoomRecordNotFoundError,
    );
  });

  it("deactivateRoom/reactivateRoom são idempotentes e auditados", async () => {
    const repo = createRoomsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const created = await repo.createRoom({ name: `Sala Toggle ${suffix}`, type: "individual", capacity: 1 }, actor);

    const deactivated = await repo.deactivateRoom(created.id, actor);
    expect(deactivated.active).toBe(false);
    const deactivatedAgain = await repo.deactivateRoom(created.id, actor);
    expect(deactivatedAgain.active).toBe(false);

    const reactivated = await repo.reactivateRoom(created.id, actor);
    expect(reactivated.active).toBe(true);

    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(logs.filter((entry) => entry.action === "room.deactivated")).toHaveLength(1);
    expect(logs.filter((entry) => entry.action === "room.reactivated")).toHaveLength(1);
  });
});
