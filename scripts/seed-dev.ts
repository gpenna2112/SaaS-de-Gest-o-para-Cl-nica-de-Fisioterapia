/**
 * Seed de desenvolvimento — só para popular um Postgres local descartável
 * para navegação manual (`npm run dev`). Insere direto via Drizzle,
 * deliberadamente ignorando repositórios/audit_log (não é código de
 * aplicação, não passa pelas mesmas regras de src/db/repositories).
 * NUNCA apontar para um banco que não seja descartável.
 *
 * Uso: node --env-file=.env.local scripts/seed-dev.ts
 */
import { createDbClient } from "../src/db/client";
import {
  clinics,
  patients,
  professionals,
  rooms,
  sessionAttendees,
  sessions,
} from "../src/db/schema";
import { todayInSaoPaulo } from "../src/modules/scheduling/day-range";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida — rode com: node --env-file=.env.local scripts/seed-dev.ts",
  );
}

function todayAt(hour: string): Date {
  return new Date(`${todayInSaoPaulo()}T${hour}:00-03:00`);
}

async function main() {
  const db = createDbClient(DATABASE_URL!);

  const [clinic] = await db
    .insert(clinics)
    .values({ name: "Clínica Exemplo" })
    .returning();
  const clinicId = clinic!.id;

  const [angelica, patricia, fernanda, sophia] = await db
    .insert(professionals)
    .values([
      {
        clinicId,
        name: "Angélica",
        email: "angelica@clinica-exemplo.test",
        role: "gestora",
      },
      {
        clinicId,
        name: "Patricia",
        email: "patricia@clinica-exemplo.test",
        role: "gestora",
      },
      {
        clinicId,
        name: "Fernanda",
        email: "fernanda@clinica-exemplo.test",
        role: "fisioterapeuta",
      },
      {
        clinicId,
        name: "Sophia",
        email: "sophia@clinica-exemplo.test",
        role: "fisioterapeuta",
      },
    ])
    .returning();

  const [sala1, sala2, salaPilates] = await db
    .insert(rooms)
    .values([
      { clinicId, name: "Sala 1", type: "individual", capacity: 1 },
      { clinicId, name: "Sala 2", type: "individual", capacity: 1 },
      { clinicId, name: "Sala Pilates", type: "pilates", capacity: 3 },
    ])
    .returning();

  const [p1, p2, p3, p4, p5, p6] = await db
    .insert(patients)
    .values([
      {
        clinicId,
        primaryProfessionalId: fernanda!.id,
        name: "Ana Souza",
        phone: "+5511987654321",
      },
      {
        clinicId,
        primaryProfessionalId: sophia!.id,
        name: "Bruno Lima",
        phone: "+5511976543210",
      },
      {
        clinicId,
        primaryProfessionalId: angelica!.id,
        name: "Carla Dias",
        phone: null,
      },
      {
        clinicId,
        primaryProfessionalId: angelica!.id,
        name: "Diego Alves",
        phone: "+5511965432109",
      },
      {
        clinicId,
        primaryProfessionalId: fernanda!.id,
        name: "Elisa Nunes",
        phone: "+5511954321098",
      },
      {
        clinicId,
        primaryProfessionalId: patricia!.id,
        name: "Fábio Rocha (inativo)",
        phone: null,
        active: false,
      },
    ])
    .returning();

  const [sessionA] = await db
    .insert(sessions)
    .values({
      clinicId,
      professionalId: fernanda!.id,
      roomId: sala1!.id,
      scheduledStart: todayAt("09:00"),
      scheduledEnd: todayAt("09:50"),
    })
    .returning();
  await db.insert(sessionAttendees).values({
    clinicId,
    sessionId: sessionA!.id,
    patientId: p1!.id,
    status: "confirmada",
    confirmedAt: new Date(),
  });

  const [sessionB] = await db
    .insert(sessions)
    .values({
      clinicId,
      professionalId: sophia!.id,
      roomId: sala2!.id,
      scheduledStart: todayAt("10:00"),
      scheduledEnd: todayAt("10:50"),
    })
    .returning();
  await db
    .insert(sessionAttendees)
    .values({
      clinicId,
      sessionId: sessionB!.id,
      patientId: p2!.id,
      status: "agendada",
    });

  const [sessionC] = await db
    .insert(sessions)
    .values({
      clinicId,
      professionalId: angelica!.id,
      roomId: salaPilates!.id,
      scheduledStart: todayAt("14:00"),
      scheduledEnd: todayAt("14:50"),
    })
    .returning();
  await db.insert(sessionAttendees).values([
    {
      clinicId,
      sessionId: sessionC!.id,
      patientId: p3!.id,
      status: "agendada",
    },
    {
      clinicId,
      sessionId: sessionC!.id,
      patientId: p4!.id,
      status: "confirmada",
      confirmedAt: new Date(),
    },
  ]);

  const [sessionD] = await db
    .insert(sessions)
    .values({
      clinicId,
      professionalId: fernanda!.id,
      roomId: sala1!.id,
      scheduledStart: todayAt("16:00"),
      scheduledEnd: todayAt("16:50"),
    })
    .returning();
  await db
    .insert(sessionAttendees)
    .values({
      clinicId,
      sessionId: sessionD!.id,
      patientId: p5!.id,
      status: "realizada",
    });

  console.log("Seed concluído.");
  console.log(`  Clínica: ${clinic!.name} (${clinicId})`);
  console.log("  Profissionais (não vinculados a login ainda):");
  for (const professional of [angelica, patricia, fernanda, sophia]) {
    console.log(
      `    - ${professional!.name} <${professional!.email}> (${professional!.role})`,
    );
  }
  console.log(`  Salas: ${sala1!.name}, ${sala2!.name}, ${salaPilates!.name}`);
  console.log(
    `  Pacientes: ${[p1, p2, p3, p4, p5, p6].map((p) => p!.name).join(", ")}`,
  );
  console.log(
    `  Sessões de hoje (${todayInSaoPaulo()}): 4 (09h, 10h, 14h, 16h)`,
  );

  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
