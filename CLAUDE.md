# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual do projeto

**MVP operacional de ponta a ponta: `scheduling` + `notifications` (outbox, sem worker de envio) + `patients` + `professionals`/`rooms` + `evolutions` + `auth`, com dashboard e CRUD completo de equipe/salas/pacientes sobre `/api/v1`.** Next.js (App Router) + TypeScript estrito + ESLint/Prettier + Vitest + Tailwind v4, estrutura modular alinhada a `docs/arquitetura/visao-geral.md`. Schema Drizzle (9 tabelas domínio, incluindo `evolutions` desde a migration `0004` + 4 tabelas Better Auth em histórico de migração separado), `scheduling-repository.ts` (ADR-0015; além de `listSessions`/`countCancelledAttendees`, expõe `getAttendee` e `listAttendanceHistoryForPatient` como leituras simples), `notifications-repository.ts` (ADR-0016), `patients-repository.ts`, `professionals-repository.ts`/`rooms-repository.ts` (agora com escrita completa — create/update/deactivate/reactivate, audit_log, únicos por clínica — antes só leitura), `evolutions-repository.ts` (ADR-0019, evolução clínica mínima antecipada da fase 3), `professionals-auth-repository.ts` (ADR-0017) e `scheduling-service.ts` (orquestra scheduling+notifications numa única transação `SERIALIZABLE`, inclui `rescheduleSession`) — tudo validado contra Postgres real. Ver `src/db/README.md`, `src/db/repositories/README.md`, `src/modules/auth/README.md`, `src/modules/evolutions/README.md`, ADR-0015/0016/0017/0019. Módulo `auth`: identidade via Better Auth (e-mail/senha, sessão de 60 dias), provisionamento sem convite por token, `getSessionUser`/`requireSessionUser`/`requireRole` como única via de proteção de rota — `requireRole(["gestora"])` agora tem uso real (escrita de `professionals`/`rooms`).

Rotas montadas: `/api/auth/[...all]` (Better Auth) e `/api/v1/{patients,professionals,rooms,sessions,session-attendees,evolutions}` (incluindo `PATCH /sessions/[id]` para remarcação, `PATCH /patients|professionals|rooms/[id]` para edição/toggle ativo, `POST /session-attendees/[id]/evolution` + `GET`/`PATCH /evolutions/[id]`) — cascas finas (ADR-0001) sobre os repositórios/serviço acima, com `error-response.ts` mapeando erros de domínio para status HTTP. UI (grupo de rotas `(app)`, guardado por `getSessionUser` no layout; grupo `(public)` para `/login`): **`/dashboard`** (nova tela inicial — sessões hoje, quem atende agora, próximo horário livre, aguardando confirmação, sem role-gating), `/agenda` (grade por sala/horário, timezone explícito via `modules/scheduling/day-range.ts`, criação/edição/**remarcação** de sessão e **registro de evolução** via painel lateral), `/pacientes` + `/pacientes/[id]` (cadastro, **edição/desativação/reativação**, **histórico de sessões e evoluções**), `/equipe` (CRUD de fisioterapeutas/salas só para `role="gestora"`; fisioterapeuta continua vendo só leitura). Leitura inicial das páginas é direta via repositório (Server Component), nunca via self-fetch a `/api/v1`; mutações client-side vão pela API. O módulo `jobs` ainda não foi implementado — notificações são gravadas no outbox mas **nada é de fato enviado ao WhatsApp** (maior lacuna restante do MVP).

Comandos: `npm run dev|build|start|lint|typecheck|test|test:watch|test:integration|format|db:generate|db:migrate|db:seed:dev|auth:schema:generate|auth:db:generate|auth:db:migrate`. `test:integration` exige Postgres real provisionado manualmente, com as duas migrations aplicadas (domínio, incluindo a `0004` de `evolutions`, e Better Auth) e `DATABASE_URL`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` setadas — nunca sobe/derruba container sozinho (ver `src/db/repositories/README.md`). Ambiente de desenvolvimento local (Postgres em Docker + seed) documentado no `README.md`.

## O que é este projeto

SaaS de gestão para clínicas de fisioterapia sem recepcionista. MVP = agenda unificada com salas como recurso escasso + confirmação automática via WhatsApp + cadastro de pacientes + registro de sessão em um toque. Leia `docs/produto/prd.md` antes de qualquer trabalho de produto.

## Documentos-fonte (ordem de leitura)

Índice completo (incluindo os READMEs técnicos que ficam ao lado do código) em `docs/README.md`. Leitura essencial:

1. `docs/produto/prd.md` — requisitos, escopo do MVP, roadmap das fases 2–5, riscos
2. `docs/arquitetura/visao-geral.md` — arquitetura consolidada, módulos e estrutura atual do código
3. `docs/arquitetura/adrs/` — decisões arquiteturais individuais com alternativas e justificativas
4. `docs/development/MCP_GUIDE.md` — para qual servidor MCP usar em cada tipo de tarefa (filesystem, GitHub, Postgres, Playwright, Figma, Context7, Google Drive)
5. `docs/frontend/design-system.md` e `docs/frontend/regras-de-interface.md` — antes de qualquer trabalho de frontend: tokens de marca/acessibilidade e regras gerais de UX/formulários/tabelas/componentes. `regras-de-interface.md` documenta explicitamente que a regra "shadcn antes de qualquer UI" **não** se aplica aqui — segue o híbrido do ADR-0018.

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
- **Paciente inativo não pode ser agendado.** `patients.active = false` bloqueia `createSession`/`addAttendee` (`PatientInactiveError`) — mas desativar um paciente **não** cancela sessões existentes nem mexe em notificações; só impede novos agendamentos. `createPatient`/`updatePatient`/`deactivatePatient` geram `audit_log` (`entity_type = 'patient'`); `deactivatePatient` é idempotente.
- **API versionada, hoje de uso interno:** identidades expostas externamente (paciente, sessão) usam UUID público, preparadas para o dia em que sistemas externos existirem. Na prática atual, `/api/v1` serve só as mutações client-side da própria UI — leitura inicial de página vai direto ao repositório via Server Component — e não há autenticação por API key implementada para consumidores externos. (ADR-0004, nota de atualização de 2026-07-21)
- **Auth isolada:** o código da aplicação conhece apenas a interface própria (`getSessionUser`/`requireSessionUser`/`requireRole`), nunca a API do Better Auth diretamente. Versão da biblioteca fixada; upgrade é tarefa deliberada. (ADR-0006)
- **Sem convite por token, sem FK para o `user` do Better Auth.** Signup só vincula a um `professional` pré-existente e não vinculado com e-mail correspondente; e-mail ambíguo entre clínicas (`professionals.email` é único só por clínica) rejeita, nunca escolhe um arbitrariamente. `professionals.auth_user_id` não tem FK enforçada (trade-off deliberado, ver ADR-0017), mas tem índice único parcial. Proteção de rota é sempre um guard explícito no topo do handler (`requireSessionUser`/`requireRole`), nunca só middleware. `role` nunca entra em `Actor` nem controla quem participa de uma sessão de agenda — só autorização de rota. (ADR-0017)
- **UX é requisito:** toda ação frequente da fisioterapeuta em ≤ 30 segundos e ≤ 3 toques, mobile-first. Se uma feature não cabe nesse orçamento, o design está errado, não o orçamento.

## Escopo — o que NÃO construir agora

Fora do MVP (PRD §5): pagamentos/cobranças, prontuário e evoluções clínicas, convênios/guias/TISS, login de paciente, agendamento self-service, mensalidades do Pilates. Também não construir: motor genérico de templates de notificação, preferências de canal por usuário, event sourcing, microsserviços, OpenTelemetry/tracing.

## Processo de decisão

Mudanças de arquitetura exigem um novo ADR em `docs/arquitetura/adrs/` (numeração sequencial, formato do `docs/arquitetura/adrs/README.md`), marcando o ADR substituído como *Superseded*. Decisões de produto contradizendo o PRD exigem atualização explícita do PRD.

## Convenções

- Documentação e textos de UI em português (pt-BR); código (identificadores, comentários) em inglês.
- Datas/horas sempre com timezone explícito; a clínica opera em `America/Sao_Paulo`.

## Autonomia de execução

Para tarefas de baixo risco, execute sem pedir confirmação intermediária.

Pode fazer automaticamente:
- ler e editar arquivos dentro deste repositório;
- criar ou remover arquivos temporários;
- executar lint, typecheck e testes;
- usar Playwright na aplicação local;
- iniciar e encerrar o servidor de desenvolvimento;
- consultar Git status e diff;
- adicionar ao stage apenas os arquivos explicitamente relacionados à tarefa.

Não peça confirmação entre cada etapa. Execute a tarefa completa e apresente o resultado ao final.

Ainda exigir confirmação antes de:
- commit;
- push;
- alterações destrutivas de banco;
- exclusão de dados reais;
- mudança de migrations já aplicadas;
- instalação ou remoção de dependências;
- alteração de secrets ou variáveis de produção;
- comandos fora deste repositório;
- ações com sudo.
