import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createDbClient } from "@/db/client";
import { createProfessionalsAuthRepository } from "@/db/repositories/professionals-auth-repository";
import { getEnv } from "@/lib/env";
import * as authSchema from "./better-auth-schema";

/**
 * Instância "crua" do Better Auth — só este módulo, `session.ts` e a rota
 * catch-all estão autorizados a importar a lib diretamente (ADR-0006/0017).
 *
 * `getAuth()` é preguiçosa (memoizada no primeiro uso), não `export const`
 * avaliado na importação: o Next.js executa o módulo de uma rota durante o
 * build (coleta de "page data"), mesmo sem nenhuma requisição real — um
 * `betterAuth({...})` no topo do arquivo quebraria o build exigindo
 * DATABASE_URL/BETTER_AUTH_SECRET/BETTER_AUTH_URL reais nesse momento,
 * contrariando o padrão já estabelecido (env.ts/client.ts também são
 * preguiçosos). A CLI do Better Auth precisa de uma instância já avaliada
 * na importação — por isso tem seu próprio arquivo de entrada,
 * better-auth-cli-config.ts, nunca importado pela aplicação.
 */
function createAuthInstance() {
  const db = createDbClient(getEnv().DATABASE_URL);
  const professionalsAuthRepository = createProfessionalsAuthRepository(db);

  const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
  const SESSION_MAX_AGE_SECONDS = ONE_DAY_IN_SECONDS * 60; // "login raro" — ADR-0006/0017.

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: getEnv().BETTER_AUTH_SECRET,
    baseURL: getEnv().BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    databaseHooks: {
      user: {
        create: {
          // Decisão 2 do ADR-0017: sem convite por token. Só ativa uma
          // conta se já existir um `professionals` com esse e-mail, sem
          // authUserId vinculado ainda. Mais de uma correspondência
          // (e-mail em duas clínicas) é tratado como erro, não escolha
          // silenciosa.
          async before(user) {
            const candidates = await professionalsAuthRepository.findUnclaimedByEmail(user.email);
            if (candidates.length === 0) {
              throw new Error("Nenhum cadastro de profissional encontrado para este e-mail.");
            }
            if (candidates.length > 1) {
              throw new Error(
                "E-mail corresponde a mais de um cadastro de profissional — não é possível vincular automaticamente.",
              );
            }
            return;
          },
          async after(user) {
            const [candidate] = await professionalsAuthRepository.findUnclaimedByEmail(user.email);
            if (!candidate) {
              // Não deveria acontecer (before já validou) — mas se a linha
              // foi reivindicada por outra requisição concorrente entre
              // before e after, falhar alto é melhor que vincular o
              // usuário errado.
              throw new Error(`Nenhum profissional pendente encontrado para vincular ao usuário ${user.id}.`);
            }
            await professionalsAuthRepository.linkAuthUser(candidate.id, user.id, {
              type: "professional",
              professionalId: candidate.id,
            });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | undefined;

export function getAuth(): ReturnType<typeof createAuthInstance> {
  authInstance ??= createAuthInstance();
  return authInstance;
}
