# Clinic Management — SaaS de Gestão para Clínicas de Fisioterapia

SaaS para clínicas de fisioterapia de pequeno e médio porte que operam **sem recepcionista**. Substitui o caderno de papel e o WhatsApp como sistema operacional da clínica, começando pela agenda unificada.

> **Princípio norteador:** toda interação deve ser mais rápida que o papel (≤ 30 segundos, ≤ 3 toques). O maior risco do produto é adoção, não técnica.

## Status

**Fundação técnica criada.** Arquitetura aprovada e documentada; scaffolding do projeto (Next.js, TypeScript estrito, lint, testes) pronto. Nenhuma entidade de domínio, schema de banco ou regra de negócio implementada ainda — aguardando decisão sobre três pontos em aberto (modelo de papéis, remarcação de sessão, capacidade de sala) antes do modelo de dados do MVP.

## Como rodar o projeto

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL antes de usar o banco (ainda não implementado)
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

### Estrutura

```
src/
  app/            # Next.js App Router: páginas e rotas /api/v1
  modules/        # Domínio puro (scheduling, patients, notifications, auth) — sem imports de Next.js
  db/             # Conexão e schema do banco — ainda vazio, ver src/db/README.md
  jobs/           # Jobs pg-boss — ainda vazio, ver src/jobs/README.md
  lib/            # env.ts (variáveis tipadas), logger.ts (pino)
```

Cada pasta em `src/modules`, `src/db` e `src/jobs` tem um `README.md` explicando sua responsabilidade e por que ainda está vazia.

## O MVP em uma frase

Agenda unificada onde **a sala é o recurso escasso** (4 fisioterapeutas ÷ 3 espaços), com conflito de sala bloqueado na origem, confirmação automática de sessões via WhatsApp, cadastro de pacientes com identidade estável e registro de sessão em um toque.

## Stack aprovada

| Camada | Escolha |
|---|---|
| Aplicação | Monólito modular em TypeScript — Next.js (PWA responsiva + API REST `/api/v1`) |
| Banco | PostgreSQL gerenciado (conflito de sala garantido por exclusion constraint) |
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
