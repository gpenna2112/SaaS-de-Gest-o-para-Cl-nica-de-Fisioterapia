# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual do projeto

**Pré-implementação.** A arquitetura está aprovada e documentada, mas ainda não há código de aplicação, `package.json` nem comandos de build/teste. Quando o scaffolding for criado, atualize este arquivo com os comandos reais (dev, build, test, lint, migrações).

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
- **Conflito de sala é garantido pelo banco**, via exclusion constraint (`EXCLUDE ... USING gist`) em migração SQL manual — nunca apenas por verificação em código de aplicação. (ADR-0002)
- **Multi-tenant desde o dia 1:** toda tabela de domínio tem `clinic_id`; todo acesso a dados passa por repositórios tenant-scoped. Nenhuma query crua no domínio. RLS será ativado antes da 2ª clínica ou da fase 3. (ADR-0007)
- **Sessões nunca são deletadas.** Cancelamento e remarcação são transições de estado. Toda mutação de agenda/status grava entrada em `audit_log` (ator, ação, antes/depois) na camada de serviço. (ADR-0010)
- **Notificações passam pelo outbox.** Nenhum envio direto a provedor; o domínio grava a notificação na tabela e o worker a processa via adapter de canal. Status de entrega é dado de produto (alimenta o KPI de taxa de confirmação), não log. (ADR-0009)
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
