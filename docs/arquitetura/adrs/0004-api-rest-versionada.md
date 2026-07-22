# ADR-0004 — API REST versionada `/api/v1` (API-first)

- **Status:** Aceito · consumo pela UI e autenticação externa corrigidos pela nota abaixo
- **Data:** 2026-07-17

> **Nota de atualização (2026-07-21):** na prática, a UI **não** consome `/api/v1` para leitura — Server Components leem direto dos repositórios (`db/repositories/*`), e só mutações client-side (criar/editar/desativar/remarcar) passam pela API. Isso diverge do texto original ("a UI consome a mesma API que sistemas externos consumirão") e não tinha sido reconciliado. Além disso, **a autenticação por API key nunca foi implementada** — hoje toda rota `/api/v1` exige sessão de cookie (Better Auth) via `requireSessionUser`/`requireRole`; não há mecanismo de acesso para consumidores externos. Ou seja, a API é versionada e existe, mas ainda é de uso **interno** — "API pública" permanece uma decisão de arquitetura tomada (o desenho já suporta), não um recurso disponível hoje. A seção Decisão abaixo foi corrigida para refletir isso; nada nas Consequências muda.

## Contexto

O PRD (§7) exige arquitetura aberta: o app irmão de avaliação de pés integrará assincronamente via API ("anexar documento clínico", fase 3), e o paciente deve ter identidade estável referenciável por sistemas externos. API-first precisa ser real, não aspiracional.

## Decisão

API REST versionada em `/api/v1`, implementada como route handlers do Next.js sobre os módulos de domínio, servindo hoje como a via de **mutação client-side** da própria UI (criar/editar/desativar/remarcar). **Leitura inicial de página não passa por `/api/v1`** — Server Components leem direto dos repositórios tenant-scoped (`db/repositories/*`); isso evita um round-trip HTTP interno redundante para dados que o próprio processo Next.js já pode buscar diretamente. Entidades referenciáveis externamente (paciente, sessão, futuramente documento clínico) expõem UUID público — nunca id sequencial — precisamente para que essa mesma API sirva consumidores externos quando existirem, sem precisar trocar identificadores depois.

Consumidores externos (o app de avaliação de pés, fase 3) ainda **não existem** e a autenticação por API key **ainda não foi implementada** — hoje a única via de acesso a `/api/v1` é sessão de cookie (Better Auth). Quando o primeiro consumidor externo real aparecer, autenticação por API key (ou equivalente) e a documentação OpenAPI do contrato precisam ser implementadas antes — não são um "detalhe de acabamento", são pré-requisito de segurança para abrir a API além da própria UI.

## Alternativas consideradas

- **tRPC / Server Actions apenas** — velocidade máxima de desenvolvimento interno com tipos automáticos, mas acopla o contrato à UI; consumidores externos não conseguem consumir. Violaria o requisito API-first do PRD.
- **GraphQL** — flexibilidade de consulta que este domínio não demanda; complexidade injustificável para o time.

## Consequências

- Quando o app de pés amadurecer, o endpoint de anexar documento nasce no mesmo lugar onde tudo já vive — sem projeto de "abrir a API" depois.
- Um pouco mais de cerimônia que RPC interno (serialização, versionamento, documentação de contrato).
- O versionamento (`/v1`) permite evoluir o contrato sem quebrar integrações externas.
