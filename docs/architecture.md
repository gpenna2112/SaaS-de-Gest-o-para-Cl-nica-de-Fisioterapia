# Arquitetura do MVP

> **Status:** Aprovada em 2026-07-17, após revisão crítica. Decisões individuais (com alternativas consideradas e justificativas) em [`adr/`](adr/). Este documento é a visão consolidada.

## Premissas

- Time de desenvolvimento de 1–2 pessoas; 4 usuárias iniciais; dezenas de sessões/dia.
- Nenhuma decisão é sobre escala — todas são sobre velocidade de iteração, custo operacional e manutenção.
- Requisitos estruturantes do PRD: interações ≤ 30s/≤ 3 toques, mobile-first, API-first (§7), sala como recurso de primeira classe, sem recepcionista (o sistema precisa se auto-vigiar).

## Visão geral

```
┌─────────────────────────────────────────────────────┐
│                Aplicação única (Next.js)             │
│                                                      │
│  UI mobile (fisios)      UI desktop (Angélica/       │
│  agenda, status 1 toque  Patricia): relatórios       │
│                                                      │
│  ────────────── API REST /api/v1 ──────────────      │
│         (mesma API usada pela UI e por               │
│          integrações externas futuras)               │
│                                                      │
│  Módulos de domínio:                                 │
│  scheduling │ patients │ notifications │ auth        │
│                                                      │
│  Worker de jobs (pg-boss): envio/agendamento         │
│  de mensagens WhatsApp, retries                      │
└──────────────────┬──────────────────────────────────┘
                   │
              PostgreSQL
                   │
        Adapter WhatsApp ⇄ Meta Cloud API (webhook)
```

Monólito modular: um deploy, um banco, transações ACID entre agenda ↔ sessão ↔ (futura) produção. A API REST `/api/v1` é a mesma que sistemas externos usarão quando existirem — hoje, na prática, ela serve só as mutações client-side da própria UI (leitura inicial de página vai direto ao repositório via Server Component, e a autenticação por API key para consumidores externos ainda não foi implementada; ver nota de atualização no [ADR-0004](adr/0004-api-rest-versionada.md)). Worker de jobs no mesmo processo Node (separável por configuração quando o volume justificar).

## Componentes e decisões

| Componente | Decisão | ADR |
|---|---|---|
| Organização | Monólito modular em TypeScript (Next.js) | [0001](adr/0001-monolito-modular-typescript-nextjs.md) |
| Banco de dados | PostgreSQL; conflito de sala via exclusion constraint | [0002](adr/0002-postgresql-exclusion-constraint.md) |
| ORM | Drizzle | [0003](adr/0003-drizzle-orm.md) |
| API | REST versionada `/api/v1`, UUIDs públicos | [0004](adr/0004-api-rest-versionada.md) |
| Frontend | PWA responsiva (sem app nativo) | [0005](adr/0005-pwa-responsiva.md) |
| Autenticação | Better Auth self-hosted, isolada atrás de interface própria | [0006](adr/0006-better-auth.md) |
| Multi-tenancy | Shared schema + `clinic_id` + repositórios tenant-scoped; RLS antes da 2ª clínica | [0007](adr/0007-multi-tenancy.md) |
| Infra/deploy | Railway: processo persistente + Postgres gerenciado; pg-boss | [0008](adr/0008-infraestrutura-railway.md) |
| Notificações | Módulo com outbox persistido + adapters de canal (WhatsApp Cloud API, fallback manual) | [0009](adr/0009-notificacoes-outbox-adapters.md) |
| Auditoria | `audit_log` na camada de serviço; sessões imutáveis (transições, nunca delete) | [0010](adr/0010-auditoria-e-imutabilidade.md) |
| Backup | Dump noturno para storage externo + teste periódico de restore | [0011](adr/0011-backup-e-recuperacao.md) |
| Observabilidade | pino + Sentry + uptime com health do worker; entregabilidade como dado de produto | [0012](adr/0012-observabilidade-minima.md) |

## Módulos de domínio

A lógica de negócio vive em módulos de serviço puros, sem imports do Next.js. Rotas HTTP são cascas finas.

- **`scheduling`** — agenda, sessões, salas/espaços, transições de status (agendada → confirmada → realizada/falta/cancelada). Regra central: conflito de sala garantido pelo banco.
- **`patients`** — cadastro, identidade estável (UUID público), vínculo com fisioterapeuta responsável.
- **`notifications`** — outbox de notificações, templates de confirmação, adapters de canal, processamento via worker, status de entrega (alimenta KPI de taxa de confirmação).
- **`auth`** — wrapper próprio sobre Better Auth (`getSessionUser()` etc.); papéis: `fisioterapeuta`, `gestora`.

Módulos futuros (fases 2–5): `billing`, `records`, `insurance`. Ver "Crescimento" abaixo.

## Estrutura de repositório planejada

Quando o scaffolding for criado, seguir esta organização (nomes indicativos):

```
src/
  app/                  # Next.js: páginas (UI) e route handlers (/api/v1)
  modules/              # Domínio puro — SEM imports de Next.js
    scheduling/
    patients/
    notifications/
    auth/
  db/                   # schema Drizzle, migrações SQL, repositórios tenant-scoped
  jobs/                 # definições pg-boss (confirmações, retries)
  lib/                  # utilitários transversais (logger, config)
docs/                   # PRD, arquitetura, ADRs
```

## Regras transversais

1. **Tenancy:** toda tabela de domínio tem `clinic_id`; acesso a dados apenas via repositórios tenant-scoped.
2. **Imutabilidade de sessões:** nunca deletar; cancelamento/remarcação são transições de estado auditadas.
3. **Auditoria:** toda mutação de agenda/status grava em `audit_log` (ator, ação, entidade, antes/depois em JSONB).
4. **Notificações via outbox:** o domínio nunca chama provedor diretamente; grava no outbox, o worker envia via adapter.
5. **Tempo:** timestamps com timezone; a clínica opera em `America/Sao_Paulo`; slots padrão de 50 min configuráveis.
6. **Identidade externa:** entidades referenciáveis por sistemas externos (paciente, sessão, documento) expõem UUID público, nunca id sequencial.

## Operação

- **Backup:** dump noturno automatizado para object storage fora do provedor (retenção 30 dias); teste de restore mensal/trimestral. RPO 24h / RTO horas — revisar com múltiplas clínicas (PITR).
- **Observabilidade:** logs estruturados JSON (pino) com `clinic_id` e request id; Sentry para erros; uptime externo em endpoint de health que verifica app, banco e idade do último job processado (detecta worker morto). Falhas de envio de confirmação aparecem na UI da gestão.
- **Deploy:** git push → Railway; staging como segundo serviço no mesmo projeto.

## Crescimento até as fases futuras (sem reescritas)

| Fase | O que muda | O que já estará pronto |
|---|---|---|
| 2 — Financeiro | Módulo `billing`: pagamentos, % de repasse por profissional, telas de produção | Sessão realizada (F4) já é a unidade de produção; pendência de falta (F2) já nasce no MVP |
| 3 — Prontuário | Módulo `records`: documentos com tipo plugável, payload JSONB, estados `rascunho → revisado → finalizado`; RLS ativado | Identidade estável do paciente; API v1 para o app de pés anexar relatórios; mecanismo de auditoria |
| 4 — Pilates | Recorrência/mensalidade no `billing` | Sala de Pilates já é recurso da agenda; capacidade é atributo do espaço |
| 5 — Convênios | Módulo `insurance`: guias com contador de 10 sessões, TISS | Presença por sessão já registrada; guia referencia sessões existentes |

Os três investimentos que compram esse futuro, todos já contemplados: `clinic_id` em tudo, domínio fora do framework, API REST versionada.

## O que explicitamente NÃO fazer agora

Microsserviços, event sourcing, GraphQL, app nativo, motor genérico de templates, preferências de canal por usuário, OpenTelemetry/tracing distribuído, RLS no dia 1 (entra antes da 2ª clínica), PITR (entra com múltiplas clínicas pagantes).
