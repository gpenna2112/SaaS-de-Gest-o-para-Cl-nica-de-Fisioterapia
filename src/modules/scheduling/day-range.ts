const SAO_PAULO_OFFSET = "-03:00";

/** Início/fim do expediente considerado pela grade da agenda e pelo dashboard (07:00–20:00). */
export const DAY_START_MINUTES = 7 * 60;
export const DAY_END_MINUTES = 20 * 60;

/**
 * Minutos desde a meia-noite, na timezone da clínica — usado tanto pela
 * grade da agenda (linha "agora", ocupação de sala) quanto pelo dashboard
 * (quem atende agora, próximo horário livre). Extraído para cá para as duas
 * telas nunca divergirem sobre o que é "agora".
 */
export function minutesSinceMidnightSaoPaulo(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Formata um instante como `HH:MM` na timezone da clínica. */
export function formatTimeSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formata um total de minutos desde a meia-noite como `HH:MM` (ex.: slot de grade). */
export function formatMinutesAsTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

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

/**
 * Formata qualquer instante como `AAAA-MM-DD` na timezone da clínica —
 * "sv-SE" formata nativamente nesse formato; truque comum, sem lib nova.
 */
export function formatDateSaoPaulo(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** "Hoje" na timezone da clínica — nunca a timezone do processo do servidor. */
export function todayInSaoPaulo(): string {
  return formatDateSaoPaulo(new Date());
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
 * Segunda-feira (ISO) da semana que contém `date` — aritmética pura sobre
 * componentes de calendário via `Date.UTC`, mesmo padrão de
 * `addDaysToDateString`. Usada pela grade semanal da agenda.
 */
export function getMondayOfWeek(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  const isoWeekday = (utc.getUTCDay() + 6) % 7; // 0 = segunda
  utc.setUTCDate(utc.getUTCDate() - isoWeekday);
  return utc.toISOString().slice(0, 10);
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
