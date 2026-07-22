const CLINIC_TIMEZONE = "America/Sao_Paulo";
const CONFIRMATION_HOUR_LOCAL = "08:00";
// América/São_Paulo é UTC-3 fixo (Brasil aboliu horário de verão em 2019).
// Se isso mudar, ou a clínica operar em outro fuso, este cálculo precisa
// ser revisitado — ver docs/produto/prd.md (clínica única, fuso único no MVP).
const CLINIC_UTC_OFFSET = "-03:00";

/**
 * Confirmação de sessão é disparada às 08:00 (fuso da clínica) do mesmo dia
 * calendário da sessão — PRD F2 ("mensagem automática no dia da sessão").
 * Usa Intl.DateTimeFormat (nativo) para determinar corretamente qual é o
 * dia calendário em América/São_Paulo a partir do instante UTC da sessão,
 * sem depender de biblioteca de fuso horário.
 */
export function computeConfirmationScheduledFor(sessionScheduledStart: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formata como AAAA-MM-DD, conveniente para montar o ISO abaixo.
  const dateInClinicTimezone = formatter.format(sessionScheduledStart);
  return new Date(`${dateInClinicTimezone}T${CONFIRMATION_HOUR_LOCAL}:00${CLINIC_UTC_OFFSET}`);
}
