export class EvolutionNotFoundError extends Error {
  constructor(public readonly evolutionId: string) {
    super(`Evolução ${evolutionId} não encontrada.`);
    this.name = "EvolutionNotFoundError";
  }
}

/** `evolutions_session_attendee_unique` — já existe uma evolução para esse atendimento. */
export class EvolutionAlreadyExistsError extends Error {
  constructor(public readonly sessionAttendeeId: string) {
    super(`Já existe uma evolução registrada para o atendimento ${sessionAttendeeId}.`);
    this.name = "EvolutionAlreadyExistsError";
  }
}

/** Só o profissional que escreveu a evolução pode editá-la (ADR-0019 §4). */
export class NotEvolutionAuthorError extends Error {
  constructor(public readonly evolutionId: string) {
    super(`Só quem registrou a evolução ${evolutionId} pode editá-la.`);
    this.name = "NotEvolutionAuthorError";
  }
}

export class AttendeeRecordNotFoundError extends Error {
  constructor(public readonly sessionAttendeeId: string) {
    super(`Participante ${sessionAttendeeId} não encontrado.`);
    this.name = "AttendeeRecordNotFoundError";
  }
}

/** Evolução só faz sentido clínico para um atendimento já `realizada` (ADR-0019 §2). */
export class AttendeeNotRealizadaError extends Error {
  constructor(public readonly sessionAttendeeId: string) {
    super(`Só é possível registrar evolução para um atendimento com status "realizada".`);
    this.name = "AttendeeNotRealizadaError";
  }
}
