# ADR-0002 — PostgreSQL, com conflito de sala garantido por exclusion constraint

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

A regra central do MVP (PRD F1): "impossível agendar duas fisios na mesma sala no mesmo horário — conflito bloqueado na origem". A sala é o recurso escasso da clínica (4 fisios ÷ 3 espaços). Essa garantia precisa valer inclusive sob requisições concorrentes. O roadmap adiciona: agregações financeiras (fase 2), documentos clínicos com tipos plugáveis (fase 3) e contadores transacionais de guias (fase 5).

## Decisão

PostgreSQL gerenciado. O conflito de sala é garantido **no nível do banco** por uma exclusion constraint (`EXCLUDE ... USING gist` com `btree_gist`, sobre sala + intervalo de horário), declarada em migração SQL manual. Verificações em código de aplicação existem apenas para UX (feedback amigável), nunca como única garantia. JSONB fica reservado para os documentos clínicos plugáveis da fase 3.

## Alternativas consideradas

- **MySQL** — familiar e amplamente gerenciado, mas sem exclusion constraints: a regra mais importante do produto dependeria só de código de aplicação, com risco de corrida.
- **SQLite (Turso/litefs)** — custo próximo de zero, mas multi-tenant + worker + webhooks concorrentes ficam desconfortáveis; a economia é irrelevante (~US$5/mês).
- **MongoDB** — o domínio é profundamente relacional (paciente–sessão–sala–fisio–guia); seria lutar contra a ferramenta.

## Consequências

- A regra de negócio mais crítica fica protegida pelo banco, à prova de concorrência, não por disciplina de código.
- A constraint vive em migração SQL escrita à mão (nenhum ORM a declara nativamente — ver ADR-0003); o processo de migração precisa acomodar SQL customizado.
- Todo o roadmap (agregações, JSONB, contadores) permanece em território natural do Postgres — sem segunda tecnologia de armazenamento no horizonte.
