import type { AttendeeStatus } from "@/modules/scheduling/session-state-machine";

export class RoomNotFoundError extends Error {
  constructor(public readonly roomId: string) {
    super(`Sala ${roomId} não encontrada.`);
    this.name = "RoomNotFoundError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Sessão ${sessionId} não encontrada.`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionAttendeeNotFoundError extends Error {
  constructor(public readonly attendeeId: string) {
    super(`Participante ${attendeeId} não encontrado.`);
    this.name = "SessionAttendeeNotFoundError";
  }
}

/** Operação exige uma session `ativa` (ex.: remarcar, adicionar participante); esta está `cancelada`. */
export class SessionNotActiveError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Sessão ${sessionId} não está ativa.`);
    this.name = "SessionNotActiveError";
  }
}

export class NoPatientsProvidedError extends Error {
  constructor() {
    super("É necessário informar ao menos um paciente para criar a sessão.");
    this.name = "NoPatientsProvidedError";
  }
}

export class DuplicatePatientIdsError extends Error {
  constructor(public readonly duplicates: string[]) {
    super(`IDs de paciente duplicados: ${duplicates.join(", ")}.`);
    this.name = "DuplicatePatientIdsError";
  }
}

/** Um ou mais patientIds não existem nesta clínica. Validado antes de qualquer escrita. */
export class PatientNotFoundError extends Error {
  constructor(public readonly patientIds: string[]) {
    super(`Paciente(s) não encontrado(s): ${patientIds.join(", ")}.`);
    this.name = "PatientNotFoundError";
  }
}

/**
 * Um ou mais patientIds existem mas estão desativados (`patients.active =
 * false`). Decisão de produto: desativar um paciente não cancela sessões
 * futuras nem mexe em notificações, só impede *novos* agendamentos — ver
 * modules/patients/README.md.
 */
export class PatientInactiveError extends Error {
  constructor(public readonly patientIds: string[]) {
    super(`Paciente(s) inativo(s), não pode(m) ser agendado(s): ${patientIds.join(", ")}.`);
    this.name = "PatientInactiveError";
  }
}

export class PatientAlreadyAttendingError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly patientId: string,
  ) {
    super(`Paciente ${patientId} já está vinculado à sessão ${sessionId}.`);
    this.name = "PatientAlreadyAttendingError";
  }
}

/** Regra de negócio: outra session ativa já ocupa essa sala nesse horário. Não é retryable. */
export class RoomConflictError extends Error {
  constructor(public readonly roomId: string) {
    super(`Sala ${roomId} já está ocupada por outra sessão ativa nesse horário.`);
    this.name = "RoomConflictError";
  }
}

/** Regra de negócio: o profissional já tem outra session ativa sobreposta. Não é retryable. */
export class ProfessionalConflictError extends Error {
  constructor(public readonly professionalId: string) {
    super(`Profissional ${professionalId} já tem outra sessão ativa nesse horário.`);
    this.name = "ProfessionalConflictError";
  }
}

/** Regra de negócio: a session já tem `rooms.capacity` participantes ativos. Não é retryable. */
export class RoomAtCapacityError extends Error {
  constructor(public readonly roomId: string) {
    super(`Sala ${roomId} está sem vaga para mais participantes nesta sessão.`);
    this.name = "RoomAtCapacityError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly from: AttendeeStatus,
    public readonly to: AttendeeStatus,
  ) {
    super(`Transição de status inválida: ${from} → ${to}.`);
    this.name = "InvalidStatusTransitionError";
  }
}

/**
 * Corrida de concorrência real (SQLSTATE 40001) que persistiu mesmo após as
 * tentativas de retry (ver src/db/transaction-retry.ts). Distinta de
 * RoomAtCapacityError/RoomConflictError/ProfessionalConflictError: aqui a
 * causa é transitória, não uma regra de negócio — o chamador deveria
 * oferecer "tente novamente", não "escolha outro horário".
 */
export class SchedulingConflictError extends Error {
  constructor(public readonly cause: unknown) {
    super("Conflito de concorrência ao agendar; tente novamente.");
    this.name = "SchedulingConflictError";
  }
}
