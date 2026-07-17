# auth

Wrapper de domínio sobre o Better Auth (self-hosted, ADR-0006). O restante do código conhece apenas interfaces próprias (ex.: `getSessionUser()`), nunca a API do Better Auth diretamente.

**Limites:** não importa nada de `src/app`. É o único módulo autorizado a importar a biblioteca `better-auth`.

**Status:** vazio, e deliberadamente adiado nesta etapa de scaffolding — configurar Better Auth exige decidir o modelo de `role` (fisioterapeuta/gestora, e se são papéis exclusivos), que está pendente de validação. Ver ADR-0006.
