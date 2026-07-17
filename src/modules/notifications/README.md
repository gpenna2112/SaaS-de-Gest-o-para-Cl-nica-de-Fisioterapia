# notifications

Outbox persistido de notificações + adapters de canal (ADR-0009, ADR-0016). No MVP, exatamente dois canais: `whatsapp_cloud_api` (Meta WhatsApp Cloud API) e `manual_fallback` (link `wa.me`).

O domínio nunca chama o provedor diretamente — grava no outbox; o worker (`src/jobs`, pg-boss — ainda não implementado) processa e atualiza o status. Status de entrega é dado de produto (alimenta o KPI de taxa de confirmação, PRD §8), não log.

Cada notificação está vinculada a um `session_attendee` (participação específica de um paciente numa sessão), não a `session_id`+`patient_id` soltos — ver ADR-0016.

**Código implementado:**
- `notification-state-machine.ts` — pura: `isValidNotificationStatusTransition`, `predecessorsOf` (estados: `pendente → enviada → entregue/falha → respondida`, mais `cancelada`).
- `scheduled-for.ts` — pura: `computeConfirmationScheduledFor(sessionScheduledStart)` — 08:00 (fuso da clínica) do dia da sessão.

O repositório (outbox propriamente dito) está em `src/db/repositories/notifications-repository.ts` (fora deste módulo, mesma decisão estrutural do `scheduling`: repositórios tenant-scoped vivem em `db/`, não em `modules/`).

**Limites:** não importa nada de `src/app`. Não conhece detalhes de agendamento além do `session_attendee_id` recebido.

**Ainda não implementado:** adapters de canal reais (Meta Cloud API, wa.me), worker pg-boss, rota/webhook de resposta do paciente.
