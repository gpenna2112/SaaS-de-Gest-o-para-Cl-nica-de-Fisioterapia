import { NextResponse } from "next/server";
import {
  InvalidPhoneError,
  PatientNotFoundError,
  ProfessionalInactiveError,
  ProfessionalNotFoundError,
} from "@/db/repositories/patients-repository.errors";
import {
  DuplicatePatientIdsError,
  NoPatientsProvidedError,
  PatientInactiveError,
  PatientNotFoundError as SchedulingPatientNotFoundError,
  ProfessionalConflictError,
  RoomAtCapacityError,
  RoomConflictError,
  RoomNotFoundError,
  SchedulingConflictError,
} from "@/db/repositories/scheduling-repository.errors";
import { logger } from "@/lib/logger";
import {
  ForbiddenError,
  UnauthenticatedError,
} from "@/modules/auth/authorization";
import { RequestValidationError } from "./parse-json-body";

/**
 * Casca fina (ADR-0001): traduz erros de domínio/validação já lançados
 * pelos módulos de serviço/repositório para o status HTTP correspondente.
 * Nenhuma regra de negócio nova aqui, só mapeamento.
 *
 * Não trata `ZodError` genericamente de propósito: `getEnv()` também usa
 * zod internamente, e um erro de configuração do servidor não pode virar
 * "dados inválidos" 400 para o cliente. Só `RequestValidationError`
 * (lançado exclusivamente por `parseJsonBody`, isolado no ponto de leitura
 * do corpo da requisição) vira 400 — qualquer outro erro cai no 500.
 *
 * `patients-repository.errors.ts` e `scheduling-repository.errors.ts` cada
 * um define seu próprio `PatientNotFoundError` (classes distintas, mesmo
 * nome) — importados com alias para não colidir.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof RequestValidationError) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: error.issues },
      { status: 400 },
    );
  }
  if (
    error instanceof NoPatientsProvidedError ||
    error instanceof DuplicatePatientIdsError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof PatientNotFoundError ||
    error instanceof ProfessionalNotFoundError ||
    error instanceof SchedulingPatientNotFoundError ||
    error instanceof RoomNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof ProfessionalInactiveError ||
    error instanceof InvalidPhoneError ||
    error instanceof PatientInactiveError
  ) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (
    error instanceof RoomConflictError ||
    error instanceof ProfessionalConflictError ||
    error instanceof RoomAtCapacityError ||
    error instanceof SchedulingConflictError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  logger.error(error, "Erro não mapeado em rota /api/v1");
  return NextResponse.json({ error: "Erro interno." }, { status: 500 });
}
