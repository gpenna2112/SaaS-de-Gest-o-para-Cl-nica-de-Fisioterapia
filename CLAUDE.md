# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual do projeto

**`scheduling` + `notifications` implementados e compostos atomicamente.** Next.js (App Router) + TypeScript estrito + ESLint/Prettier + Vitest, estrutura modular alinhada a `docs/architecture.md`. Schema Drizzle (8 tabelas), `scheduling-repository.ts` (ADR-0015), `notifications-repository.ts` (ADR-0016) e `scheduling-service.ts` (orquestra os dois numa única transação `SERIALIZABLE`) implementados e validados contra Postgres real — ver `src/db/README.md`, `src/db/repositories/README.md`, ADR-0015/0016. Nenhuma rota de API, ou os módulos `patients`/`auth`/`jobs` foram implementados ainda.

Comandos: `npm run dev|build|start|lint|typecheck|test|test:watch|test:integration|format|db:generate|db:migrate`. `test:integration` exige Postgres real provisionado manualmente — nunca sobe/derruba container sozinho (ver `src/db/repositories/README.md`).

## O que é este projeto

SaaS de gestão para clínicas de fisioterapia sem recepcionista. MVP = agenda unificada com salas como recurso escasso + confirmação automática via WhatsApp + cadastro de pacientes + registro de sessão em um toque. Leia `docs/prd.md` antes de qualquer trabalho de produto.

## Documentos-fonte (ordem de leitura)

1. `docs/prd.md` — requisitos, escopo do MVP, roadmap das fases 2–5, riscos
2. `docs/architecture.md` — arquitetura consolidada, módulos e estrutura planejada do código
3. `docs/adr/` — decisões arquiteturais individuais com alternativas e justificativas

## Arquitetura aprovada (resumo operacional)

Monólito modular TypeScript: Next.js servindo a PWA (mobile-first para fisios, desktop para gestão) e a API REST `/api/v1`; PostgreSQL + Drizzle; pg-boss para jobs; Better Auth; deploy no Railway. Detalhes e alternativas rejeitadas nos ADRs — não rediscuta decisões já registradas sem criar um novo ADR que substitua o anterior.

## Regras invioláveis ao escrever código

Estas regras vêm dos ADRs e do PRD; violá-las é regressão de arquitetura:

- **Lógica de domínio fora do framework.** Módulos de serviço (`scheduling`, `patients`, `notifications`, `auth`) não importam nada do Next.js. Rotas são cascas finas. (ADR-0001)
- **`sessions` é a turma (1 profissional, 1 sala, 1 horário), nunca um paciente.** Quem participa é `session_attendees` (1..N pacientes, até `rooms.capacity`). Status completo (agendada/confirmada/realizada/falta/cancelada) é por participante; `sessions.status` só tem `ativa`/`cancelada`. Cancelar o último `attendee` ativo cancela a `session` automaticamente. (ADR-0015)
- **Toda mutação que lê-para-validar-depois-escreve roda em transação `SERIALIZABLE`** — conflito de sala (uma `session` ativa por sala/horário), conflito de profissional (um profissional não conduz duas `sessions` ativas sobrepostas, mesmo em salas diferentes), capacidade de `session_attendees`, transições de status. Sem `FOR UPDATE` explícito — a garantia vem do isolamento. Retry limitado (3 tentativas, backoff curto) só em `serialization_failure`; nunca esconde outros erros. Erros de regra de negócio (`RoomAtCapacityError`, `RoomConflictError`, `ProfessionalConflictError`) são distintos de `SchedulingConflictError` (concorrência esgotada). Não é `EXCLUDE` constraint no banco. (ADR-0013 + ADR-0014 + ADR-0015, qualificam o ADR-0002)
- **Multi-tenant desde o dia 1:** toda tabela de domínio tem `clinic_id`; todo acesso a dados passa por repositórios tenant-scoped. Nenhuma query crua no domínio. RLS será ativado antes da 2ª clínica ou da fase 3. (ADR-0007)
- **`sessions` e `session_attendees` nunca são deletadas.** Cancelamento e remarcação são transições de estado. Toda mutação de agenda/status grava entrada em `audit_log` (ator, ação, antes/depois) na camada de serviço. (ADR-0010)
- **Notificações passam pelo outbox, vinculadas a `session_attendee`, nunca a `session`+`patient` soltos.** Nenhum envio direto a provedor; o domínio grava a notificação na tabela e o worker a processa via adapter de canal. Status de entrega é dado de produto (alimenta o KPI de taxa de confirmação), não log. Remarcação reagenda só confirmações `pendente`; quem já respondeu/foi notificado/cancelou não é reaberto. Cancelar um participante cancela só a notificação pendente dele. (ADR-0009, ADR-0016)
- **Repositórios de módulos diferentes compõem atomicamente via `Tx` externa opcional**, nunca importando um o outro diretamente — a orquestração vive numa camada de serviço (`modules/*/x-service.ts`) que abre a transação e passa para ambos. (ADR-0016)
- **API pública versionada:** identidades expostas externamente (paciente, sessão) usam UUID público. A UI consome a mesma `/api/v1` que sistemas externos consumirão. (ADR-0004)
- **Auth isolada:** o código da aplicação conhece apenas a interface própria (ex.: `getSessionUser()`), nunca a API do Better Auth diretamente. Versão da biblioteca fixada; upgrade é tarefa deliberada. (ADR-0006)
- **UX é requisito:** toda ação frequente da fisioterapeuta em ≤ 30 segundos e ≤ 3 toques, mobile-first. Se uma feature não cabe nesse orçamento, o design está errado, não o orçamento.

## Escopo — o que NÃO construir agora

Fora do MVP (PRD §5): pagamentos/cobranças, prontuário e evoluções clínicas, convênios/guias/TISS, login de paciente, agendamento self-service, mensalidades do Pilates. Também não construir: motor genérico de templates de notificação, preferências de canal por usuário, event sourcing, microsserviços, OpenTelemetry/tracing.

## Processo de decisão

Mudanças de arquitetura exigem um novo ADR em `docs/adr/` (numeração sequencial, formato do `docs/adr/README.md`), marcando o ADR substituído como *Superseded*. Decisões de produto contradizendo o PRD exigem atualização explícita do PRD.

## Convenções

- Documentação e textos de UI em português (pt-BR); código (identificadores, comentários) em inglês.
- Datas/horas sempre com timezone explícito; a clínica opera em `America/Sao_Paulo`.
