import { z } from "zod";

/**
 * `agendada` fica de fora de propósito: é só o estado inicial de criação
 * (scheduling-repository.createSession/addAttendee), nunca um destino de
 * transição — a state machine (session-state-machine.ts) já rejeitaria,
 * mas rejeitar aqui dá uma mensagem mais clara que um 409 de transição.
 */
export const updateAttendeeStatusSchema = z.object({
  status: z.enum(["confirmada", "realizada", "falta", "cancelada"], {
    message: "Status inválido.",
  }),
});

export type UpdateAttendeeStatusInput = z.infer<
  typeof updateAttendeeStatusSchema
>;

export const addAttendeeSchema = z.object({
  patientId: z.string().uuid({ message: "Paciente inválido." }),
});

export type AddAttendeeInput = z.infer<typeof addAttendeeSchema>;
