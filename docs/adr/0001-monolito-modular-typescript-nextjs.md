# ADR-0001 — Monólito modular em TypeScript com Next.js

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

Time de 1–2 devs, 4 usuárias iniciais, SaaS em estágio de validação. O diferencial competitivo do produto é experiência de interação (agenda ≤ 30s/≤ 3 toques, mobile-first) — UI-intensivo, não formulário-intensivo. O roadmap (fases 2–5) exige consistência forte entre módulos: "sessão realizada = unidade de produção" é uma transação, não um evento eventual.

## Decisão

Monólito modular em TypeScript de ponta a ponta, usando Next.js como framework único para UI (PWA) e API (`/api/v1`). Lógica de negócio em módulos de serviço puros (`scheduling`, `patients`, `notifications`, `auth`) que **não importam nada do Next.js**; rotas HTTP são cascas finas. Módulos futuros (`billing`, `records`, `insurance`) entram como novos módulos no mesmo monólito.

## Alternativas consideradas

- **Rails / Laravel / Django** — produtividade altíssima em CRUD e convenções maduras, mas duas linguagens ao introduzir a interatividade rica que a agenda exige; o esforço deve se concentrar na UI, onde React rende mais.
- **Go/NestJS + SPA separada** — separação limpa, mas dois projetos, dois deploys e contrato duplicado; overhead injustificável para 1–2 devs.
- **Microsserviços** — resolvem problemas de organização de times que não temos; trariam rede, observabilidade distribuída e consistência eventual entre agenda e financeiro. Complexidade máxima, benefício zero neste estágio.
- **Monólito + serviço separado só para WhatsApp** — o isolamento certo é lógico (adapter/outbox, ADR-0009), não de rede.

## Consequências

- Uma linguagem, um repositório, um deploy; tipos compartilhados entre API e UI.
- Transações ACID entre agenda ↔ sessão ↔ produção, das quais as fases 2–5 dependem.
- Exige disciplina de fronteiras internas entre módulos — a regra "domínio sem imports de framework" é o que mantém a opção de extração futura aberta sem pagar o preço agora.
- Worker de jobs (pg-boss) roda no mesmo processo; separável em segundo processo por configuração quando o volume justificar.
