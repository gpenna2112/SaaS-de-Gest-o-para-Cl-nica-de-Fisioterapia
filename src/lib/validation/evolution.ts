import { z } from "zod";

export const createEvolutionSchema = z.object({
  content: z.string().min(1, "Escreva o conteúdo da evolução."),
});

export type CreateEvolutionRequest = z.infer<typeof createEvolutionSchema>;

export const updateEvolutionSchema = z.object({
  content: z.string().min(1, "Escreva o conteúdo da evolução."),
});

export type UpdateEvolutionRequest = z.infer<typeof updateEvolutionSchema>;
