# ADR-0008 — Infraestrutura: Railway, processo persistente, pg-boss

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O requisito técnico decisivo é a F2: receber webhooks do WhatsApp e disparar mensagens agendadas com retry — isso pede um processo que está sempre de pé. Time de 1–2 devs não pode virar time de ops. Custo precisa caber num SaaS sem precificação definida.

## Decisão

Railway (ou equivalente direto, ex. Render): um serviço Node persistente (Next.js + worker pg-boss no mesmo processo) + PostgreSQL gerenciado no mesmo projeto. Deploy por git push; staging como segundo serviço no mesmo painel. Custo estimado: US$ 10–20/mês. Fila de jobs: **pg-boss** — a fila vive no próprio Postgres, sem broker adicional (Redis etc.).

## Alternativas consideradas

- **Vercel + Neon (serverless)** — DX excelente e tier grátis, mas jobs agendados e workers de fila são o ponto fraco do modelo: cron limitado, filas gerenciadas extras, cold start em webhook, duas plataformas para operar. A F2 é exatamente o caso ruim.
- **Supabase como plataforma** — empurra lógica para cliente/RLS; agendamento e mensageria vivem melhor em servidor próprio.
- **VPS (Hetzner + Coolify)** — custo mínimo absoluto, mas nós viramos o time de ops (patches, backup, monitoramento): o pior uso do tempo de 1–2 devs.
- **AWS/GCP direto** — poder total; complexidade e custo de atenção absurdos para o estágio.

## Consequências

- Modelo mental mais simples possível: um app, um banco, um botão de deploy.
- Webhooks e scheduler funcionam trivialmente num processo persistente.
- Menos "infinitamente escalável" que serverless — irrelevante no volume atual; migrar de PaaS com dezenas de clínicas pagantes é um problema bom e barato.
- Backups default do PaaS são insuficientes — tratados no ADR-0011.
