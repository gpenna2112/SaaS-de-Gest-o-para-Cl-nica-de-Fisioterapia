export class PatientNotFoundError extends Error {
  constructor(public readonly patientIds: string[]) {
    super(`Paciente(s) não encontrado(s): ${patientIds.join(", ")}.`);
    this.name = "PatientNotFoundError";
  }
}

export class ProfessionalNotFoundError extends Error {
  constructor(public readonly professionalId: string) {
    super(`Profissional ${professionalId} não encontrado.`);
    this.name = "ProfessionalNotFoundError";
  }
}

export class ProfessionalInactiveError extends Error {
  constructor(public readonly professionalId: string) {
    super(`Profissional ${professionalId} está inativo — não pode ser responsável por um paciente.`);
    this.name = "ProfessionalInactiveError";
  }
}

export class InvalidPhoneError extends Error {
  constructor(public readonly rawPhone: string) {
    super(`Telefone inválido: ${rawPhone}.`);
    this.name = "InvalidPhoneError";
  }
}
