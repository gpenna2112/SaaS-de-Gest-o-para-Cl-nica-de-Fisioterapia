# auth

Wrapper de domínio sobre o Better Auth (self-hosted, ADR-0006). O restante do código conhece apenas interfaces próprias (`getSessionUser`, `requireSessionUser`, `requireRole`), nunca a API do Better Auth diretamente — só `better-auth-instance.ts`, a rota catch-all (`src/app/api/auth/[...all]/route.ts`) e `session.ts` importam a biblioteca.

**Escopo, provisionamento e autorização:** ver ADR-0017. Resumo:

- Better Auth cuida só de identidade (e-mail/senha, sessão, cookie) — sem plugin de Organizations, sem conceito de clínica/papel.
- Sem convite por token: o cadastro (`signUpEmail`) só é aceito se já existir uma linha `professionals` **não vinculada** (`auth_user_id is null`) com o mesmo e-mail. Sem correspondência → rejeitado. Mais de uma correspondência (e-mail repetido em clínicas diferentes — `professionals.email` só é único por clínica, `user.email` do Better Auth é único globalmente) → rejeitado, não escolhe uma arbitrariamente.
- **Sem FK** entre `professionals.auth_user_id` e `user.id` do Better Auth — trade-off deliberado, justificativa completa no ADR-0017. Há um índice único parcial (`professionals_auth_user_id_unique`, `WHERE auth_user_id IS NOT NULL`) garantindo que um `user` do Better Auth nunca fique vinculado a mais de um `professional`.
- `role` (`fisioterapeuta`/`gestora`) nunca entra no `SessionUser` como controle de identidade de agenda — `Actor` (scheduling/notifications/patients) continua sem campo de papel. `role` só existe para autorização de rota.
- Proteção de rota é responsabilidade exclusiva do route handler: `requireSessionUser(request)` / `requireRole(request, ["gestora"])` no topo de cada rota protegida. Nenhum middleware é a autoridade.

**Código implementado:**

- `authorization.ts` — puro: `SessionUser`, `Role`, `hasRole`, `UnauthenticatedError`, `ForbiddenError`.
- `session.ts` — `getSessionUser(request)` (retorna `null` para "sem sessão" e para "sessão válida mas profissional desativado" — `professionals.active` é checado a cada chamada, não só no login, porque a sessão dura até 60 dias), `requireSessionUser`, `requireRole` (lançam em vez de retornar `Response` — a rota decide o mapeamento HTTP).
- `better-auth-instance.ts` — instância do Better Auth (adapter Drizzle, `emailAndPassword`, sessão de 60 dias com renovação deslizante de 1 dia, hook `user.create.before/after` que implementa o provisionamento acima). Export é um getter lazy memoizado (`getAuth()`), nunca uma constante eager — instanciar no import quebra o build do Next.js (`getEnv()` roda durante "Collect page data", antes das env vars de runtime existirem).
- `better-auth-cli-config.ts` — **só para a CLI** (`npm run auth:schema:generate`), nunca importado por código de aplicação. A CLI do Better Auth precisa de uma instância eager; existe aqui isolado para não entrar no grafo de build do Next.js.
- `better-auth-schema.ts` — gerado por `npm run auth:schema:generate` (tabelas `user`/`session`/`account`/`verification`). Não editar à mão; regenerar e conferir o diff.
- `migrations/` — migrations do schema do Better Auth, geradas por `drizzle-kit generate --config drizzle.auth.config.ts`. Histórico de migração **separado** do resto do domínio (schema de tracking `drizzle_auth`, tabela `__drizzle_migrations_auth`) — ver `src/db/README.md`.

O repositório de resolução de identidade (`professionals-auth-repository.ts`) está em `src/db/repositories/` — deliberadamente **não** tenant-scoped (sem `clinicId` na factory), porque seu propósito é resolver a identidade antes de a clínica ser conhecida (login, hook de signup).

**Limites:** não importa nada de `src/app`.

**Ainda não implementado:** rotas de login/signup na UI, middleware complementar (opcional, ADR-0017 Decisão 5), fluxo de troca/recuperação de senha.
