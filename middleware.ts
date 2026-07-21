import { NextResponse, type NextRequest } from "next/server";

/**
 * Só encaminha o path+query atual como header (`x-pathname`) — não faz
 * nenhuma checagem de autenticação aqui. `getSessionUser`/`requireSessionUser`
 * continuam sendo a única fonte de verdade de auth (ADR-0017); isso existe
 * só para o layout de `(app)` saber para onde redirecionar de volta depois
 * do login, sem duplicar lógica de sessão em runtime de Edge.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
