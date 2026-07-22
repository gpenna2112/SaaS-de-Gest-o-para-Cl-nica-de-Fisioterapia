# ADR-0012 — Observabilidade mínima: pino, Sentry, uptime com health do worker

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

Não existe recepcionista: se o envio de confirmações falhar silenciosamente, ninguém na clínica percebe — as pacientes só deixam de receber mensagens e as faltas explodem. **O sistema precisa se auto-vigiar porque o cliente não vai vigiá-lo.** O modo de falha mais silencioso é o worker de jobs morto. Omissão identificada na revisão crítica.

## Decisão

Kit mínimo:

1. **Logs estruturados** (pino, JSON) com `clinic_id` e request id em tudo — barato no dia 1, doloroso de retrofitar.
2. **Sentry** (tier grátis) para erros da aplicação e do worker.
3. **Uptime externo** (UptimeRobot/Better Stack, grátis) sobre um endpoint de health que verifica app, banco **e idade do último job processado** — é isso que detecta o worker morto.
4. **Distinção estrutural:** entregabilidade de mensagem **não é log, é dado de produto** — status por notificação vive no outbox (ADR-0009), alimenta o KPI de taxa de confirmação (PRD §8) e um aviso visível na UI de gestão ("N confirmações falharam hoje"). Logs são para depurar.

## Alternativas consideradas

- **Nada além dos logs do PaaS** — falha silenciosa da F2 passaria despercebida; inaceitável dado o contexto sem operador.
- **OpenTelemetry / Grafana / tracing distribuído** — instrumentação de um problema que não temos; explicitamente fora do escopo atual.

## Consequências

- Os três modos de falha relevantes ficam cobertos: erro de código (Sentry), sistema fora do ar (uptime), worker morto (health com idade de job).
- Custo ~zero em dinheiro; pequeno custo de disciplina (logger estruturado desde o primeiro arquivo).
- A falha de confirmação chega ao usuário certo (gestão) pela UI, não escondida em log.
