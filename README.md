# Clinic Management — SaaS de Gestão para Clínicas de Fisioterapia

SaaS para clínicas de fisioterapia de pequeno e médio porte que operam **sem recepcionista**. Substitui o caderno de papel e o WhatsApp como sistema operacional da clínica, começando pela agenda unificada.

> **Princípio norteador:** toda interação deve ser mais rápida que o papel (≤ 30 segundos, ≤ 3 toques). O maior risco do produto é adoção, não técnica.

## Status

**Agenda + notificações + cadastro de pacientes + autenticação implementados.** Arquitetura aprovada e documentada; schema Drizzle (8 tabelas de domínio — uma `session` é a turma, com 1 a `rooms.capacity` pacientes em `session_attendees`; confirmações em `notifications`, vinculadas por `session_attendee` — mais 4 tabelas do Better Auth em histórico de migração separado), os repositórios de `scheduling`, `notifications`, `patients` e `professionals-auth-repository`, e o serviço que compõe scheduling+notifications numa única transação (criar sessão + agendar confirmação, ou nenhum dos dois) — tudo validado contra Postgres real, com testes de concorrência real. Desativar um paciente bloqueia novos agendamentos sem afetar sessões existentes. Autenticação via Better Auth (e-mail/senha, sessão de 60 dias): signup só vincula a um `professional` pré-existente, sem convite por token; `getSessionUser`/`requireSessionUser`/`requireRole` protegem rotas, com `professionals.active` checado a cada requisição. Ver ADR-0015/0016/0017. Nenhuma rota de API além de `/api/auth/[...all]`, nem o módulo `jobs`, implementados ainda.

## Como rodar o projeto

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL, BETTER_AUTH_SECRET e BETTER_AUTH_URL
npm run db:migrate           # aplica as migrations de domínio em src/db/migrations
npm run auth:db:migrate      # aplica as migrations do Better Auth em src/modules/auth/migrations
npm run dev                  # http://localhost:3000
```

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Testes unitários (Vitest) |
| `npm run test:watch` | Testes em modo watch |
| `npm run format` / `format:check` | Prettier |
| `npm run db:generate` | Gera migration SQL a partir do schema Drizzle (domínio) |
| `npm run db:migrate` | Aplica as migrations de domínio pendentes no banco de `DATABASE_URL` |
| `npm run test:integration` | Testes de integração (exige Postgres real com as duas migrations aplicadas — ver `src/db/repositories/README.md`) |
| `npm run auth:schema:generate` | Gera `src/modules/auth/better-auth-schema.ts` via CLI do Better Auth |
| `npm run auth:db:generate` | Gera migration SQL das tabelas do Better Auth (histórico separado) |
| `npm run auth:db:migrate` | Aplica as migrations do Better Auth pendentes |

### Estrutura

```
src/
  app/            # Next.js App Router: páginas e rotas /api/v1
  modules/        # Domínio puro (scheduling, patients, notifications, auth) — sem imports de Next.js
  db/             # Schema Drizzle, migrations e client de conexão — ver src/db/README.md
  jobs/           # Jobs pg-boss — ainda vazio, ver src/jobs/README.md
  lib/            # env.ts (variáveis tipadas), logger.ts (pino)
```

Cada pasta em `src/modules` e `src/jobs` tem um `README.md` explicando sua responsabilidade e por que ainda está vazia; `src/db/README.md` documenta as decisões que moldam o schema atual.

## O MVP em uma frase

Agenda unificada onde **a sala é o recurso escasso** (4 fisioterapeutas ÷ 3 espaços), com conflito de sala bloqueado na origem, confirmação automática de sessões via WhatsApp, cadastro de pacientes com identidade estável e registro de sessão em um toque.

## Stack aprovada

| Camada | Escolha |
|---|---|
| Aplicação | Monólito modular em TypeScript — Next.js (PWA responsiva + API REST `/api/v1`) |
| Banco | PostgreSQL gerenciado (ocupação de sala validada na aplicação por capacidade, ADR-0013) |
| ORM | Drizzle |
| Jobs | pg-boss (worker no mesmo processo) |
| Auth | Better Auth (self-hosted, e-mail/senha) |
| Notificações | Módulo com outbox persistido + adapters de canal (WhatsApp Cloud API oficial; fallback manual `wa.me`) |
| Deploy | Railway (processo Node persistente + Postgres no mesmo projeto) |

O racional completo de cada decisão está em [`docs/adr/`](docs/adr/).

## Documentação

- [`docs/prd.md`](docs/prd.md) — Documento de requisitos do produto (PRD v1.0)
- [`docs/architecture.md`](docs/architecture.md) — Arquitetura consolidada do MVP
- [`docs/adr/`](docs/adr/) — Architecture Decision Records (uma decisão por arquivo)
- [`CLAUDE.md`](CLAUDE.md) — Guia para agentes de IA trabalhando neste repositório

## Roadmap (resumo)

1. **MVP** — Agenda unificada + confirmação WhatsApp + pacientes + registro de sessão
2. **Financeiro** — Produção por fisio, repasse de 50%, pagamentos (Pix/dinheiro), pendências de faltas
3. **Prontuário digital** — Documentos clínicos com estados (`rascunho → revisado → finalizado`), tipos plugáveis
4. **Mensalidades do Pilates**
5. **Convênios** — Guias (10 sessões), faturamento TISS

Detalhes e justificativa do sequenciamento no [PRD, §6](docs/prd.md).
