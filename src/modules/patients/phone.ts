/**
 * Normaliza um telefone brasileiro para E.164 (+55DDNNNNNNNNN), aceitando
 * formatos comuns de entrada (com/sem DDI, com/sem formatação). Não é um
 * validador completo de telefonia — só o suficiente para armazenar algo
 * usável pelo WhatsApp Cloud API (ADR-0009). `null` = entrada não reconhecida
 * como telefone válido; quem chama decide se isso é erro (cadastro) ou
 * apenas "sem telefone utilizável".
 */
export function normalizePhone(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");

  let national: string;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    national = digits.slice(2);
  } else if (digits.length === 10 || digits.length === 11) {
    national = digits;
  } else {
    return null;
  }

  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return null;
  }

  return `+55${national}`;
}

export function isValidPhone(rawPhone: string): boolean {
  return normalizePhone(rawPhone) !== null;
}
