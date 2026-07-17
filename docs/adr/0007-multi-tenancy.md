# ADR-0007 — Multi-tenancy: shared schema + `clinic_id`; RLS como pré-condição de crescimento

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O produto é um SaaS, mas o MVP atende uma única clínica-piloto. Retrofitar multi-tenancy depois é uma migração de alto risco; custa uma coluna agora. A falha clássica do modelo por coluna é um `WHERE clinic_id = ?` esquecido — e a partir da fase 3 (prontuário) um vazamento seria de **dado de saúde** (LGPD, dado sensível).

## Decisão

Em duas etapas:

1. **MVP:** shared schema com `clinic_id` em toda tabela de domínio. Todo acesso a dados passa por **repositórios tenant-scoped** — nenhuma query crua na camada de domínio. O escopo do tenant é resolvido uma vez por requisição e injetado; nunca repetido à mão em cada query.
2. **Antes da 2ª clínica ou da fase 3 (o que vier primeiro):** ativar **Row-Level Security** do Postgres como cinto de segurança por baixo dos repositórios — o banco recusa linhas de outro tenant mesmo que uma query esqueça o filtro. Isto é pré-condição de crescimento, não "talvez".

## Alternativas consideradas

- **Schema-per-tenant** — isolamento forte, mas migrações multiplicadas por clínica; overkill para a escala-alvo (dezenas de clínicas).
- **Database-per-tenant** — isolamento máximo, custo e operação proibitivos no estágio.
- **RLS desde o dia 1** — segurança máxima, mas complica pooling/transações (setar tenant por conexão) enquanto existe literalmente um tenant; adiado deliberadamente, com gatilho explícito.

## Consequências

- Custo presente mínimo (uma coluna + disciplina de repositório); porta aberta para N clínicas.
- O gatilho do RLS precisa ser respeitado — está registrado aqui e no CLAUDE.md para não ser esquecido.
- Logs e auditoria também carregam `clinic_id` (ADR-0010, ADR-0012), mantendo rastreabilidade por tenant.
