# Clinic Management — SaaS de Gestão para Clínicas de Fisioterapia

SaaS para clínicas de fisioterapia de pequeno e médio porte que operam **sem recepcionista**. Substitui o caderno de papel e o WhatsApp como sistema operacional da clínica, começando pela agenda unificada.

> **Princípio norteador:** toda interação deve ser mais rápida que o papel (≤ 30 segundos, ≤ 3 toques). O maior risco do produto é adoção, não técnica.

## Status

**MVP operacional de ponta a ponta: dashboard, agenda com remarcação, CRUD completo de pacientes/fisioterapeutas/salas, evolução clínica mínima e autenticação.** Arquitetura aprovada e documentada; schema Drizzle (9 tabelas de domínio — uma `session` é a turma, com 1 a `rooms.capacity` pacientes em `session_attendees`; confirmações em `notifications`, vinculadas por `session_attendee`; `evolutions` guarda uma nota clínica por atendimento realizado, ADR-0019 — mais 4 tabelas do Better Auth em histórico de migração separado), os repositórios de `scheduling` (inclui remarcação e histórico por paciente), `notifications`, `patients`, `professionals`/`rooms` (create/update/desativar/reativar, não só leitura), `evolutions` e `professionals-auth-repository`, e o serviço que compõe scheduling+notifications numa única transação (criar/remarcar sessão + agendar/reagendar confirmação, ou nenhum dos dois) — tudo validado contra Postgres real, com testes de concorrência real. Desativar um paciente, fisioterapeuta ou sala bloqueia novos agendamentos/uso sem afetar sessões existentes. Autenticação via Better Auth (e-mail/senha, sessão de 60 dias): signup só vincula a um `professional` pré-existente, sem convite por token; `getSessionUser`/`requireSessionUser`/`requireRole` protegem rotas, com `professionals.active` checado a cada requisição — cadastro de equipe/salas é restrito a `role = "gestora"`. Ver ADR-0015/0016/0017/0019.

**O que ainda falta para operar 100% pelo sistema:** o módulo `jobs` (worker de envio real das confirmações por WhatsApp — hoje só existe o outbox, nada é enviado de fato) e a evolução completa do prontuário (fase 3 do PRD, com estados rascunho/revisado/finalizado).

## Como rodar o projeto

Pré-requisitos: Node.js 20+, npm e Docker (para o Postgres local).

### Primeira instalação

Em uma máquina nova, o caminho mais rápido é o script de setup — ele checa os pré-requisitos, instala dependências, cria `.env.local` (sem sobrescrever um já existente) e sobe o Postgres local com migrations e seed aplicados:

```powershell
# Windows (PowerShell)
.\setup.ps1
```

```bash
# macOS / Linux
./setup.sh
```

Guia completo (incluindo o passo a passo manual equivalente e solução de problemas) em [`docs/SETUP.md`](docs/SETUP.md).

### Passo a passo manual

```bash
npm install

# Postgres local persistente (ajuste a porta host se 5432 já estiver em uso).
docker volume create clinic-mgmt-dev-db-data
docker run -d --name clinic-mgmt-dev-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clinic_management \
  -p 5434:5432 -v clinic-mgmt-dev-db-data:/var/lib/postgresql/data \
  postgres:16-alpine

cp .env.example .env.local
# Preencha DATABASE_URL apontando para a porta escolhida acima, gere
# BETTER_AUTH_SECRET (openssl rand -base64 32) e ajuste BETTER_AUTH_URL para
# a porta em que o `next dev` efetivamente subir (ele pula para a próxima
# porta livre se 3000 estiver ocupada — confira o log ao rodar `npm run dev`).

npm run db:migrate           # aplica as migrations de domínio em src/db/migrations
npm run auth:db:migrate      # aplica as migrations do Better Auth em src/modules/auth/migrations
npm run db:seed:dev          # popula uma clínica de exemplo (ver scripts/seed-dev.ts) — rode só uma vez por banco
npm run dev
```

O seed cria profissionais **sem login vinculado ainda** (mesmo fluxo real de provisionamento — ver ADR-0017). Para conseguir entrar em `/login`, crie a conta pelo endpoint real do Better Auth (uma vez, por profissional que você quiser usar):

```bash
curl -X POST http://localhost:3001/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"angelica@clinica-exemplo.test","password":"dev12345678","name":"Angélica"}'
```

Depois disso, entre em `/login` com esse e-mail/senha. Profissionais disponíveis no seed: `angelica@clinica-exemplo.test` (gestora), `patricia@clinica-exemplo.test` (gestora), `fernanda@clinica-exemplo.test` (fisioterapeuta), `sophia@clinica-exemplo.test` (fisioterapeuta) — todas com a mesma senha usada no signup.

Para parar/retomar o banco entre sessões, sem perder dados: `docker stop clinic-mgmt-dev-db` / `docker start clinic-mgmt-dev-db`. Para descartar tudo e recomeçar: `docker rm -f clinic-mgmt-dev-db && docker volume rm clinic-mgmt-dev-db-data`, depois repita os passos acima.

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
| `npm run db:seed:dev` | Popula uma clínica de exemplo em `DATABASE_URL` para navegação manual (`scripts/seed-dev.ts`) — dev-only, não usa os repositórios/audit_log |

### Estrutura

```
src/
  app/            # Next.js App Router: páginas e rotas /api/v1
  modules/        # Domínio puro (scheduling, patients, notifications, auth, evolutions) — sem imports de Next.js
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
