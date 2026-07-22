import { z } from "zod";

/** Limite de produto (não é limitação de banco — `evolutions.content` é `text`, sem tamanho fixo). */
export const EVOLUTION_CONTENT_MAX_LENGTH = 5000;

const contentSchema = z
  .string()
  .min(1, "Escreva o conteúdo da evolução.")
  .max(EVOLUTION_CONTENT_MAX_LENGTH, `A evolução não pode passar de ${EVOLUTION_CONTENT_MAX_LENGTH} caracteres.`);

export const createEvolutionSchema = z.object({
  content: contentSchema,
});

export type CreateEvolutionRequest = z.infer<typeof createEvolutionSchema>;

export const updateEvolutionSchema = z.object({
  content: contentSchema,
});

export type UpdateEvolutionRequest = z.infer<typeof updateEvolutionSchema>;
