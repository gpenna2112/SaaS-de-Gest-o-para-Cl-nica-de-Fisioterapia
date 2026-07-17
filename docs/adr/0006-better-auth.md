# ADR-0006 — Better Auth self-hosted, isolada atrás de interface própria

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

4 usuárias por clínica, dois papéis (`fisioterapeuta`, `gestora`), e-mail/senha, sem SSO/social/MFA no MVP. Requisito de UX crítico: a fisio não pode ter que logar entre sessões — sessão longa no aparelho, login raro. A partir da fase 3 o sistema guarda dados de saúde (LGPD): controle dos dados de auth no nosso banco é relevante. Risco reconhecido na revisão crítica: Better Auth é projeto jovem, com API ainda em evolução.

## Decisão

Better Auth (biblioteca open-source, self-hosted) com e-mail/senha e sessão persistente longa. Duas mitigações obrigatórias para o risco de maturidade:

1. **Versão fixada**; upgrades são tarefa deliberada, nunca automática.
2. **Isolamento**: o restante do código conhece apenas interfaces próprias (ex.: `getSessionUser()`), nunca a API do Better Auth diretamente — trocar de biblioteca fica confinado ao módulo `auth`.

## Alternativas consideradas

- **Clerk / Auth0** — UI pronta e zero manutenção, mas vendor lock-in no ponto nevrálgico, custo por MAU conforme o SaaS cresce e dependência externa para *entrar no sistema*.
- **Auth.js (NextAuth)** — padrão do ecossistema, mas o projeto desencoraja ativamente e-mail/senha (nosso caso principal) e a modelagem de organizações/roles é mais manual.
- **Supabase Auth** — só faz sentido adotando a plataforma Supabase inteira; nossa lógica vive no servidor próprio (ver ADR-0008).

## Consequências

- Dados de auth no nosso Postgres; custo zero por usuário; suporte nativo a organizações/roles alinhado ao multi-tenant.
- Operamos reset de senha e e-mail transacional.
- A superfície usada (e-mail/senha + sessão) é pequena e estável — o risco real de instabilidade da biblioteca é baixo e está cercado pelo isolamento.
