# ADR-0009 — Notificações: outbox persistido + adapters de canal

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

A F2 (confirmação automática no dia da sessão) é a feature mais arriscada do MVP: depende do WhatsApp, cuja API oficial tem custo/burocracia (risco registrado no PRD §10). O PRD pede "taxa de confirmação" como indicador (§8). A revisão crítica concluiu que a abstração certa é o **canal de notificação**, não o provedor de WhatsApp — o fallback manual, um eventual SMS (plano B de banimento) e futuros e-mails mostram isso.

## Decisão

Módulo `notifications` com duas peças:

1. **Outbox persistido**: tabela de notificações (destinatário, canal, template, status: `pendente → enviada → entregue/falha → respondida`, resposta). O domínio **nunca chama provedor diretamente** — grava no outbox; o worker (pg-boss) processa, envia via adapter e atualiza o status, com retry sobre o próprio outbox.
2. **Adapters de canal** atrás de interface única. No MVP, exatamente dois: `whatsapp-cloud-api` (Meta WhatsApp Cloud API, oficial) e `manual-fallback` (gera mensagem pronta + link `wa.me` que a fisio envia com um toque). Resposta do paciente chega por webhook e atualiza o status da sessão.

O status de entrega é **dado de produto** (alimenta o KPI de taxa de confirmação e o aviso de falhas na UI), não log.

## Alternativas consideradas

- **Provedor não-oficial (Evolution/Z-API)** — populares no Brasil e mais simples, porém risco real de banimento do número; inaceitável quando confirmação é a feature central.
- **Twilio** — oficial, porém mais caro e uma camada a mais sobre a mesma Cloud API.
- **Chamada direta ao provedor (sem outbox)** — mais simples no dia 1, mas sem retry confiável, sem KPI e com troca de provedor espalhada pelo domínio.
- **Motor genérico de notificações** (templates dinâmicos, preferências por usuário, orquestração multi-canal) — over-engineering sem demanda no PRD; explicitamente fora.

## Consequências

- Retry confiável, KPI de confirmação, troca de provedor sem tocar no domínio e degradação elegante para fallback manual — quatro problemas resolvidos por uma peça.
- A burocracia de verificação da Meta (Business) não bloqueia o MVP: lança-se com `manual-fallback` se preciso, mantendo a promessa de velocidade.
- Um webhook público exige endpoint autenticado/verificado conforme a Cloud API.
