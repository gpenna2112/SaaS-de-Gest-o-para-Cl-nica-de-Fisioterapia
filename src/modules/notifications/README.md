# notifications

Outbox persistido de notificações + adapters de canal (ADR-0009). No MVP, exatamente dois canais: `whatsapp-cloud-api` (Meta WhatsApp Cloud API) e `manual-fallback` (link `wa.me`).

O domínio nunca chama o provedor diretamente — grava no outbox; o worker (`src/jobs`, pg-boss) processa e atualiza o status. Status de entrega é dado de produto (alimenta o KPI de taxa de confirmação, PRD §8), não log.

**Limites:** não importa nada de `src/app`. Não conhece detalhes de agendamento além de `session_id`/`patient_id` recebidos.

**Status:** vazio. Sem código ainda — nenhum adapter, nenhuma interface. Ver ADR-0009.
