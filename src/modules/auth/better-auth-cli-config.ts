import { getAuth } from "./better-auth-instance";

/**
 * Ponto de entrada exclusivo da CLI do Better Auth (`--config` aponta para
 * este arquivo). A CLI exige uma instância já avaliada na importação —
 * nunca importar este arquivo da aplicação (só better-auth-instance.ts,
 * que expõe a versão preguiçosa usada em runtime).
 */
export const auth = getAuth();
