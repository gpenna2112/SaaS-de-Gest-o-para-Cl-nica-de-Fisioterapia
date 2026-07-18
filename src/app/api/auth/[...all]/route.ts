import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/modules/auth/better-auth-instance";

// Casca fina (ADR-0001): expõe os endpoints do próprio Better Auth
// (sign-in, sign-up, sign-out, sessão) sob /api/auth/*. Nenhuma lógica aqui
// além de repassar para a instância — quem quiser autenticar via nossas
// rotas de domínio usa modules/auth/session.ts, não este arquivo.
//
// getAuth() só é chamada dentro dos handlers (tempo de requisição), nunca
// no topo do módulo — o Next.js executa o módulo da rota durante o build
// (coleta de "page data"), e getAuth() precisa de env vars reais.
let handlers: ReturnType<typeof toNextJsHandler> | undefined;
function getHandlers() {
  handlers ??= toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request) {
  return getHandlers().GET(request);
}

export async function POST(request: Request) {
  return getHandlers().POST(request);
}
