import { z } from "zod";

const roleSchema = z.enum(["fisioterapeuta", "gestora"], {
  message: "Selecione um papel válido.",
});

export const createProfessionalSchema = z.object({
  name: z.string().min(1, "Informe o nome do profissional."),
  email: z.string().email({ message: "E-mail inválido." }),
  role: roleSchema,
});

export type CreateProfessionalInput = z.infer<typeof createProfessionalSchema>;

export const updateProfessionalSchema = z.object({
  name: z.string().min(1, "Informe o nome do profissional.").optional(),
  email: z.string().email({ message: "E-mail inválido." }).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export type UpdateProfessionalRequest = z.infer<typeof updateProfessionalSchema>;
