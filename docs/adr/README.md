# Architecture Decision Records (ADRs)

Registro das decisões arquiteturais do projeto: contexto, alternativas consideradas e consequências. Decisões aqui registradas **não devem ser rediscutidas informalmente** — para mudar uma decisão, crie um novo ADR que a substitua e marque o antigo como `Superseded by ADR-XXXX`.

## Índice

| # | Decisão | Status |
|---|---|---|
| [0001](0001-monolito-modular-typescript-nextjs.md) | Monólito modular em TypeScript com Next.js | Aceito |
| [0002](0002-postgresql-exclusion-constraint.md) | PostgreSQL, com conflito de sala garantido por exclusion constraint | Aceito · mecanismo qualificado pelo 0013 |
| [0003](0003-drizzle-orm.md) | Drizzle como ORM | Aceito |
| [0004](0004-api-rest-versionada.md) | API REST versionada `/api/v1` (API-first) | Aceito |
| [0005](0005-pwa-responsiva.md) | PWA responsiva em vez de app nativo | Aceito |
| [0006](0006-better-auth.md) | Better Auth self-hosted, isolada atrás de interface própria | Aceito |
| [0007](0007-multi-tenancy.md) | Multi-tenancy: shared schema + `clinic_id`; RLS como pré-condição de crescimento | Aceito |
| [0008](0008-infraestrutura-railway.md) | Infraestrutura: Railway, processo persistente, pg-boss | Aceito |
| [0009](0009-notificacoes-outbox-adapters.md) | Notificações: outbox persistido + adapters de canal | Aceito · schema/vínculo detalhados no 0016 |
| [0010](0010-auditoria-e-imutabilidade.md) | Auditoria via `audit_log` e imutabilidade de sessões | Aceito |
| [0011](0011-backup-e-recuperacao.md) | Backup: dump externo diário + teste de restore | Aceito |
| [0012](0012-observabilidade-minima.md) | Observabilidade mínima: pino, Sentry, uptime com health do worker | Aceito |
| [0013](0013-capacidade-sala-validacao-aplicacao.md) | Capacidade de sala: validação na aplicação via transação `SERIALIZABLE` | Aceito · algoritmo superado pelo 0015 (contava sessions, não attendees) |
| [0014](0014-concorrencia-scheduling-escopo-retry-testes.md) | Controle de concorrência em `scheduling`: escopo, retry e estratégia de teste | Aceito · mecanismo de retry continua válido, escopo detalhado no 0015 |
| [0015](0015-modelo-participacao-session-attendees.md) | Modelo de participação: `session_attendees`, conflito de sala/profissional, cancelamento em cascata | Aceito |
| [0016](0016-notifications-outbox-session-attendee.md) | Notifications: vínculo por `session_attendee`, idempotência, atomicidade com `scheduling` | Aceito |

## Formato

```markdown
# ADR-XXXX — Título

- **Status:** Proposto | Aceito | Superseded by ADR-YYYY
- **Data:** AAAA-MM-DD

## Contexto
## Decisão
## Alternativas consideradas
## Consequências
```
