# ADR-0004 — API REST versionada `/api/v1` (API-first)

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O PRD (§7) exige arquitetura aberta: o app irmão de avaliação de pés integrará assincronamente via API ("anexar documento clínico", fase 3), e o paciente deve ter identidade estável referenciável por sistemas externos. API-first precisa ser real, não aspiracional.

## Decisão

API REST versionada em `/api/v1`, implementada como route handlers do Next.js sobre os módulos de domínio. **A UI consome a mesma API que sistemas externos consumirão.** Entidades referenciáveis externamente (paciente, sessão, futuramente documento clínico) expõem UUID público — nunca id sequencial. Consumidores externos autenticam por API key. Contrato documentável via OpenAPI.

## Alternativas consideradas

- **tRPC / Server Actions apenas** — velocidade máxima de desenvolvimento interno com tipos automáticos, mas acopla o contrato à UI; consumidores externos não conseguem consumir. Violaria o requisito API-first do PRD.
- **GraphQL** — flexibilidade de consulta que este domínio não demanda; complexidade injustificável para o time.

## Consequências

- Quando o app de pés amadurecer, o endpoint de anexar documento nasce no mesmo lugar onde tudo já vive — sem projeto de "abrir a API" depois.
- Um pouco mais de cerimônia que RPC interno (serialização, versionamento, documentação de contrato).
- O versionamento (`/v1`) permite evoluir o contrato sem quebrar integrações externas.
