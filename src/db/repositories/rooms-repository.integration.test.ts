import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { clinics, rooms } from "../schema";
import { createRoomsRepository } from "./rooms-repository";

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
  return { clinicId: clinic!.id, otherClinicId: otherClinic!.id };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
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
});
