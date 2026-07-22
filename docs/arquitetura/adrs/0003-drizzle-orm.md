# ADR-0003 — Drizzle como ORM

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

Precisamos de um ORM TypeScript sobre PostgreSQL. As consultas que importam neste produto (ocupação por sala, produção por fisioterapeuta, agregações do financeiro) são SQL relacional clássico. A exclusion constraint do ADR-0002 vive em migração SQL manual em qualquer cenário — **nenhum ORM TypeScript a declara nativamente**, portanto ela não diferencia as opções (ponto corrigido na revisão crítica: a justificativa original superestimava esse fator).

## Decisão

Drizzle ORM, com migrações que acomodam SQL customizado para as constraints nativas do Postgres.

## Alternativas consideradas

- **Prisma** — DX mais guiada, migrations maduras, documentação enorme. Porém runtime mais pesado, passo de codegen, e tendência a resolver em memória o que o SQL faz melhor. Alternativa perfeitamente viável; a escolha por Drizzle é preferência defensável, não decisão crítica.
- **Query builder puro (Kysely) / SQL cru** — máximo controle, mas perde schema tipado e migrations integradas que aceleram um time de 1–2 devs.

## Consequências

- O que se escreve é o SQL que executa — transparência útil num domínio agregação-intensivo.
- Migrations um pouco mais espartanas que as do Prisma; SQL manual convive no mesmo fluxo.
- **Decisão barata de reverter apenas até o primeiro commit de schema** — se o time mudar, decidir antes de codificar. Depois disso, a troca custa uma reescrita de camada de dados.
