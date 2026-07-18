import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "@/db/client";
import { auditLog, clinics, professionals } from "@/db/schema";
import { user as authUserTable } from "./better-auth-schema";
import { getAuth } from "./better-auth-instance";
import { getSessionUser } from "./session";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations de src/db/migrations E src/modules/auth/migrations já " +
      "aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

const PASSWORD = "senha-de-teste-123456";

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("signUpEmail/signInEmail não retornou Set-Cookie — resposta inesperada do Better Auth.");
  }
  return setCookie.split(";")[0]!;
}

function requestWithCookie(cookie?: string): Request {
  return new Request("http://localhost:3000/x", cookie ? { headers: { cookie } } : undefined);
}

interface Fixture {
  clinicId: string;
  createUnclaimedProfessional: (email: string, role?: "fisioterapeuta" | "gestora") => Promise<string>;
}

async function setupFixture(): Promise<Fixture> {
  const [clinic] = await db.insert(clinics).values({ name: `Auth Session Test Clinic ${randomUUID()}` }).returning();
  return {
    clinicId: clinic!.id,
    createUnclaimedProfessional: async (email, role = "fisioterapeuta") => {
      const [professional] = await db
        .insert(professionals)
        .values({ clinicId: clinic!.id, name: "Fisio Teste", email, role })
        .returning();
      return professional!.id;
    },
  };
}

async function cleanup(clinicId: string, emails: string[]): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
  if (emails.length > 0) {
    await db.delete(authUserTable).where(inArray(authUserTable.email, emails));
  }
}

describe("getSessionUser — fluxo de sessão real com Better Auth", () => {
  let fixture: Fixture;
  const usedEmails: string[] = [];

  beforeEach(async () => {
    fixture = await setupFixture();
    usedEmails.length = 0;
  });

  afterEach(async () => {
    await cleanup(fixture.clinicId, usedEmails);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("retorna null quando não há cookie de sessão", async () => {
    expect(await getSessionUser(requestWithCookie())).toBeNull();
  });

  it("signup vincula o professional pré-existente e getSessionUser resolve o profissional certo", async () => {
    const email = `flow-${randomUUID()}@test.local`;
    usedEmails.push(email);
    const professionalId = await fixture.createUnclaimedProfessional(email, "gestora");

    const signUpResponse = await getAuth().api.signUpEmail({
      body: { email, password: PASSWORD, name: "Fisio Teste" },
      asResponse: true,
    });
    expect(signUpResponse.status).toBe(200);
    const cookie = extractSessionCookie(signUpResponse);

    const sessionUser = await getSessionUser(requestWithCookie(cookie));

    expect(sessionUser).toEqual({
      professionalId,
      clinicId: fixture.clinicId,
      role: "gestora",
      name: "Fisio Teste",
      email,
    });
  });

  it("profissional desativado com sessão Better Auth ainda válida → getSessionUser retorna null", async () => {
    const email = `flow-${randomUUID()}@test.local`;
    usedEmails.push(email);
    const professionalId = await fixture.createUnclaimedProfessional(email);

    const signUpResponse = await getAuth().api.signUpEmail({
      body: { email, password: PASSWORD, name: "Fisio Teste" },
      asResponse: true,
    });
    const cookie = extractSessionCookie(signUpResponse);

    // Confirma que a sessão está válida antes de desativar.
    expect(await getSessionUser(requestWithCookie(cookie))).not.toBeNull();

    await db.update(professionals).set({ active: false }).where(eq(professionals.id, professionalId));

    // Mesma sessão (mesmo cookie) — a checagem de `active` é feita a cada
    // chamada, não só no login.
    expect(await getSessionUser(requestWithCookie(cookie))).toBeNull();
  });

  it("signup é rejeitado quando não há professional correspondente ao e-mail (sem convite por token — ADR-0017)", async () => {
    const email = `sem-professional-${randomUUID()}@test.local`;
    usedEmails.push(email);

    await expect(
      getAuth().api.signUpEmail({ body: { email, password: PASSWORD, name: "Ninguém" } }),
    ).rejects.toThrow();
  });

  it("signup é rejeitado quando o e-mail corresponde a mais de um professional (clínicas diferentes) — caso ambíguo", async () => {
    const email = `ambiguo-${randomUUID()}@test.local`;
    usedEmails.push(email);
    const [otherClinic] = await db.insert(clinics).values({ name: `Outra Clínica ${randomUUID()}` }).returning();

    await fixture.createUnclaimedProfessional(email);
    await db.insert(professionals).values({ clinicId: otherClinic!.id, name: "Outro", email, role: "fisioterapeuta" });

    await expect(
      getAuth().api.signUpEmail({ body: { email, password: PASSWORD, name: "Ambíguo" } }),
    ).rejects.toThrow();

    await db.delete(professionals).where(eq(professionals.clinicId, otherClinic!.id));
    await db.delete(clinics).where(eq(clinics.id, otherClinic!.id));
  });
});
