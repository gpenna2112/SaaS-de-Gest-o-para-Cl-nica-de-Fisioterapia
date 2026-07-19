import { z } from "zod";

/**
 * `scheduledStart`/`scheduledEnd` exigem timezone explícito no ISO 8601
 * (offset ou `Z`) — nunca hora "flutuante" (convenção do projeto: datas
 * sempre com timezone explícito). Transforma direto para `Date`, já no
 * formato que `CreateSessionInput` (scheduling-repository) espera.
 */
export const createSessionSchema = z
  .object({
    professionalId: z.string().uuid({ message: "Selecione um profissional." }),
    roomId: z.string().uuid({ message: "Selecione uma sala." }),
    scheduledStart: z
      .string()
      .datetime({ offset: true, message: "Data/hora de início inválida." })
      .transform((value) => new Date(value)),
    scheduledEnd: z
      .string()
      .datetime({ offset: true, message: "Data/hora de término inválida." })
      .transform((value) => new Date(value)),
    patientIds: z
      .array(z.string().uuid({ message: "Paciente inválido." }))
      .min(1, "Selecione ao menos um paciente."),
  })
  .refine((data) => data.scheduledEnd > data.scheduledStart, {
    message: "O horário de término deve ser depois do início.",
    path: ["scheduledEnd"],
  })
  .refine((data) => new Set(data.patientIds).size === data.patientIds.length, {
    message: "Pacientes duplicados.",
    path: ["patientIds"],
  });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
