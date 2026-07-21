import { z } from "zod";

const typeSchema = z.enum(["individual", "pilates"], {
  message: "Selecione um tipo de sala válido.",
});

export const createRoomSchema = z.object({
  name: z.string().min(1, "Informe o nome da sala."),
  type: typeSchema,
  capacity: z.number().int().min(1, "A capacidade mínima é 1."),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1, "Informe o nome da sala.").optional(),
  type: typeSchema.optional(),
  capacity: z.number().int().min(1, "A capacidade mínima é 1.").optional(),
  active: z.boolean().optional(),
});

export type UpdateRoomRequest = z.infer<typeof updateRoomSchema>;
