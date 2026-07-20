const SAO_PAULO_OFFSET = "-03:00";

/**
 * Limites do dia `date` (formato `AAAA-MM-DD`) na timezone da clínica
 * (America/Sao_Paulo — datas sempre com timezone explícito). Offset fixo,
 * sem depender de biblioteca de timezone: o Brasil aboliu o horário de
 * verão em 2019, então não há ambiguidade de DST a resolver aqui.
 */
export function dayRangeInSaoPaulo(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00${SAO_PAULO_OFFSET}`);
  const end = new Date(`${date}T23:59:59.999${SAO_PAULO_OFFSET}`);
  if (Number.isNaN(start.getTime())) {
    throw new RangeError(`Data inválida: ${date}`);
  }
  return { start, end };
}

/** "Hoje" na timezone da clínica — nunca a timezone do processo do servidor. */
export function todayInSaoPaulo(): string {
  // "sv-SE" formata nativamente como AAAA-MM-DD; truque comum, sem lib nova.
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Soma `delta` dias (pode ser negativo) a uma data `AAAA-MM-DD`, sem
 * depender de fuso — aritmética pura sobre os componentes de calendário via
 * `Date.UTC`, imune à timezone local do processo.
 */
export function addDaysToDateString(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

/**
 * Junta uma data `AAAA-MM-DD` e uma hora `HH:MM` (dois campos separados de
 * formulário) num ISO 8601 com timezone explícito da clínica — o formato
 * que `createSessionSchema` (src/lib/validation/session.ts) exige. Utilitário
 * reutilizável em vez de composição de string inline no formulário.
 */
export function combineDateAndTimeInSaoPaulo(date: string, time: string): string {
  return `${date}T${time}:00${SAO_PAULO_OFFSET}`;
}

/**
 * Soma `minutes` (pode ser negativo) a uma hora `HH:MM`, com wrap em 24h —
 * usado só para sugerir um horário de término a partir do início + duração
 * padrão da clínica; não representa virada de dia (é só um prefill editável).
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = (hour! * 60 + minute! + minutes + 1440) % 1440;
  const wrappedHour = Math.floor(totalMinutes / 60);
  const wrappedMinute = totalMinutes % 60;
  return `${String(wrappedHour).padStart(2, "0")}:${String(wrappedMinute).padStart(2, "0")}`;
}

/**
 * Formata `date` (`AAAA-MM-DD`) por extenso em português, ex. "segunda-feira,
 * 20 de julho" — meio-dia (`-03:00`) evita qualquer risco de a formatação
 * cair no dia anterior/seguinte por causa de fuso na borda da meia-noite.
 */
export function formatDateLongPtBr(date: string): string {
  const instant = new Date(`${date}T12:00:00${SAO_PAULO_OFFSET}`);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Data inválida: ${date}`);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(instant);
}
