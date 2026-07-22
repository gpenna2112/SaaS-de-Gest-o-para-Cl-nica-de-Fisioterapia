import { z } from "zod";
import { isValidPhone } from "@/modules/patients/phone";

/**
 * Compartilhado entre o formulário de cadastro (validação no cliente, antes
 * de submeter) e `POST /api/v1/patients` (validação no servidor) — mesma
 * regra de telefone válido (`isValidPhone`) usada pelo repositório
 * (`patients-repository.ts`), para a mensagem de erro no formulário nunca
 * divergir do que o backend realmente aceita.
 */
export const createPatientSchema = z.object({
  primaryProfessionalId: z
    .string()
    .uuid({ message: "Selecione um profissional responsável." }),
  name: z.string().min(1, "Informe o nome do paciente."),
  phone: z
    .string()
    .min(1)
    .nullish()
    .refine((value) => !value || isValidPhone(value), {
      message: "Telefone inválido.",
    }),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

/**
 * Todos os campos opcionais — `PATCH` só envia o que mudou. `active`
 * controla desativar/reativar (repositório trata como duas operações
 * idempotentes distintas, mas a UI expõe como um único toggle).
 */
export const updatePatientSchema = z.object({
  primaryProfessionalId: z.string().uuid({ message: "Selecione um profissional responsável." }).optional(),
  name: z.string().min(1, "Informe o nome do paciente.").optional(),
  phone: z
    .string()
    .min(1)
    .nullish()
    .refine((value) => !value || isValidPhone(value), {
      message: "Telefone inválido.",
    }),
  active: z.boolean().optional(),
});

export type UpdatePatientRequest = z.infer<typeof updatePatientSchema>;
