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
