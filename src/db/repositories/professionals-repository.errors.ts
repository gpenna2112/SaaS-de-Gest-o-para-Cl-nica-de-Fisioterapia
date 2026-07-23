/** Nome distinto de `patients-repository.errors::ProfessionalNotFoundError` (aquele valida uma referência; este é sobre o próprio registro do CRUD). */
export class ProfessionalRecordNotFoundError extends Error {
  constructor(public readonly professionalId: string) {
    super(`Profissional ${professionalId} não encontrado.`);
    this.name = "ProfessionalRecordNotFoundError";
  }
}

/** `professionals_clinic_email_unique` — e-mail já usado por outro profissional desta clínica. */
export class DuplicateProfessionalEmailError extends Error {
  constructor(public readonly email: string) {
    super(`Já existe um profissional com o e-mail ${email} nesta clínica.`);
    this.name = "DuplicateProfessionalEmailError";
  }
}

/** Impede desativar ou rebaixar a última gestora ativa da clínica — bloquearia toda ação restrita a `role="gestora"` sem via de recuperação pela própria aplicação. */
export class LastGestoraError extends Error {
  constructor(public readonly professionalId: string) {
    super("Não é possível desativar ou rebaixar a última gestora ativa desta clínica.");
    this.name = "LastGestoraError";
  }
}

/** Esgotadas as tentativas de retry sob SERIALIZABLE (`src/db/transaction-retry.ts`) — conflito real de concorrência, nunca um `SchedulingConflictError` de agenda (que não tem relação com profissionais). */
export class ProfessionalsWriteConflictError extends Error {
  constructor(public readonly cause: unknown) {
    super("Conflito de concorrência ao gravar profissional; tente novamente.");
    this.name = "ProfessionalsWriteConflictError";
  }
}

/** Exclusão definitiva bloqueada por FK (sessões, pacientes com este profissional como responsável, etc.) — nunca apagamos histórico (ADR-0010); a via correta nesse caso é desativar. */
export class ProfessionalHasRelatedRecordsError extends Error {
  constructor(public readonly professionalId: string) {
    super(
      "Não é possível excluir: este profissional tem sessões ou pacientes vinculados. Desative em vez de excluir.",
    );
    this.name = "ProfessionalHasRelatedRecordsError";
  }
}
