export class RoomRecordNotFoundError extends Error {
  constructor(public readonly roomId: string) {
    super(`Sala ${roomId} não encontrada.`);
    this.name = "RoomRecordNotFoundError";
  }
}

/** `rooms_clinic_name_unique` — nome já usado por outra sala desta clínica. */
export class DuplicateRoomNameError extends Error {
  constructor(public readonly roomName: string) {
    super(`Já existe uma sala chamada "${roomName}" nesta clínica.`);
    this.name = "DuplicateRoomNameError";
  }
}

/** Exclusão definitiva bloqueada por FK (sessões vinculadas a esta sala) — nunca apagamos histórico (ADR-0010); a via correta nesse caso é desativar. */
export class RoomHasRelatedRecordsError extends Error {
  constructor(public readonly roomId: string) {
    super("Não é possível excluir: esta sala tem sessões vinculadas. Desative em vez de excluir.");
    this.name = "RoomHasRelatedRecordsError";
  }
}
