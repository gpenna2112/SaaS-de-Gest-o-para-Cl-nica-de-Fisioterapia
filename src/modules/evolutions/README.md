# evolutions

Evolução clínica mínima (ADR-0019), antecipada da fase 3 do PRD (prontuário completo). Uma nota de texto livre por atendimento (`session_attendees`) com status `realizada` — não por `session` (turma): numa sala de Pilates com vários pacientes, cada um tem sua própria evolução.

Diferente da fase 3, **não há máquina de estados** (`rascunho → revisado → finalizado`) — só autor, conteúdo e timestamps. Editável apenas pelo autor original, com trilha completa em `audit_log` (diferente da imutabilidade de `sessions`/`session_attendees`, ADR-0010 — aqui a correção de texto clínico é legítima, e a auditoria preserva "quem mudou o quê quando" no lugar da imutabilidade).

**Sem código de domínio puro neste módulo** — ao contrário de `scheduling`/`patients`, a regra de negócio inteira (uma evolução por atendimento, só para `realizada`, só o autor edita) é simples o bastante para viver direto no repositório, sem uma máquina de estados ou função pura separada para testar isoladamente. Este README existe para manter a mesma convenção de documentação dos módulos irmãos, mesmo sem um arquivo `.ts` aqui.

**Onde está o código:**
- Schema: `src/db/schema/evolutions.ts` (migration `0004_tense_owl.sql`).
- Repositório: `src/db/repositories/evolutions-repository.ts` — `createEvolution`, `updateEvolution`, `getEvolution`, `getBySessionAttendee`, `listByPatient` (cronológico, mais antiga primeiro). Erros em `evolutions-repository.errors.ts`.
- Composição com `scheduling`: a validação "attendee existe e está `realizada`" acontece na rota (`POST /api/v1/session-attendees/[attendeeId]/evolution`), usando `schedulingRepository.getAttendee` — nenhum dos dois repositórios importa a tabela do outro (ADR-0016).
- Rotas: `POST /api/v1/session-attendees/[attendeeId]/evolution` (criar) e `GET` no mesmo caminho (consulta se já existe evolução para aquele attendee — usado pelo painel da sessão para decidir "criar" vs. "editar"), `PATCH /api/v1/evolutions/[evolutionId]` (editar, só o autor).
- UI: seção "+ Registrar evolução" no painel da sessão (`session-panel.tsx`, só para attendees `realizada`) e seção "Evoluções" na página do paciente (`/pacientes/[patientId]`, cronológica).

**Limites:** não importa nada de `src/app`. Não conhece `session_attendees` como tabela — recebe `sessionAttendeeId`/`patientId` já resolvidos por quem chama.
