# ADR-0019 — Evolução clínica mínima, antecipada da fase 3

- **Status:** Aceito
- **Data:** 2026-07-21

## Contexto

O PRD (§5, "Fora do MVP") e o roadmap (§6, fase 3) marcam explicitamente "prontuário e evoluções clínicas" como fora do MVP — a fase 3 prevê um prontuário completo, com tipos de documento plugáveis e um fluxo de estados (`rascunho → revisado → finalizado`), alinhado às regras de segurança clínica do app-irmão de avaliação de pés (PRD §7.1).

Uma decisão de produto posterior (não deste ADR — registrada na condução do trabalho, não no PRD) pediu para trazer para o MVP atual: histórico clínico do paciente, registro de evolução após cada atendimento, e consulta cronológica dessas evoluções. Isso contradiz o texto atual do PRD — CLAUDE.md exige que decisões de produto que contradizem o PRD tenham atualização explícita dele; este ADR registra a decisão arquitetural correspondente, e o PRD recebe uma nota de reprioritização apontando para cá.

## Decisão

Implementar uma **versão mínima** de evolução clínica, deliberadamente mais simples que a visão completa da fase 3:

1. **Uma evolução por atendimento**, não por sessão. O vínculo é com `session_attendees` (um registro por participação de um paciente numa turma), não com `sessions` — é o atendimento individual que gera a evolução, não a turma inteira (relevante em salas de Pilates, onde uma turma tem vários pacientes). Constraint `UNIQUE(session_attendee_id)`.
2. **Só para atendimento `realizada`.** Registrar evolução de uma sessão que ainda vai acontecer, ou que terminou em falta/cancelamento, não faz sentido clínico — a tentativa lança `AttendeeNotRealizadaError` (422).
3. **Sem máquina de estados.** Nada de `rascunho/revisado/finalizado` — isso é o modelo completo da fase 3, desenhado para o requisito de segurança clínica do app de avaliação de pés (revisão humana obrigatória antes de publicar). Aqui é só um campo de texto livre (`content`), com autor e timestamp.
4. **Editável pelo próprio autor, com auditoria completa.** Diferente da imutabilidade de `sessions`/`session_attendees` (ADR-0010 — lá a imutabilidade protege a integridade de uma transação de agendamento/cobrança), uma nota de evolução é texto clínico que o profissional legitimamente precisa corrigir (erro de digitação, complemento esquecido). A trilha de auditoria (`audit_log`, before/after) preserva a rastreabilidade que a imutabilidade dava — não abrimos mão de "quem mudou o quê quando", só permitimos a correção. Só o autor original edita; qualquer outro profissional lançaria `NotEvolutionAuthorError` (403).
5. **Nova tabela `evolutions`** (não reaproveita `audit_log`): `id`, `clinic_id`, `session_attendee_id` (unique, fk), `patient_id` (fk, desnormalizado para consulta cronológica direta sem join por `session_attendees`), `professional_id` (autor), `content` (text), `created_at`, `updated_at`. Módulo novo `modules/evolutions` (espelha `modules/patients`), repositório `evolutions-repository.ts` seguindo exatamente o padrão de escrita+audit já usado em `patients-repository.ts`/`professionals-repository.ts`/`rooms-repository.ts`.

## Alternativas consideradas

- **Esperar a fase 3 completa** — rejeitada: a decisão de produto pediu isso agora; adiar contradiria a instrução recebida sem justificativa técnica forte o suficiente (não há impeditivo real de arquitetura).
- **Vincular evolução à `session` em vez de `session_attendee`** — rejeitada: numa turma de Pilates com 3 pacientes, cada um tem sua própria evolução clínica; vincular à turma obrigaria um campo "de quem é essa evolução" redundante com o que `session_attendees` já modela.
- **Reaproveitar o modelo de estados da fase 3 desde já** — rejeitada por ora: adicionar `rascunho/revisado/finalizado` sem um requisito real de revisão-antes-de-publicar (que vem do app de avaliação de pés, não da fisioterapia direta) seria complexidade antecipada sem uso — mesmo racional de "não pagar custo de design antecipado" já registrado em `docs/frontend/design-system.md` §6.5. Migrar para o modelo completo fica mais simples partindo de uma tabela já existente do que perseguir os dois problemas ao mesmo tempo.
- **Evolução imutável (sem edição)** — considerada, rejeitada: geraria "evoluções fantasma" de correção (nova linha "correção da anterior") sem benefício real sobre editar com audit_log, e prejudicaria a leitura cronológica (poluída por correções triviais).

## Consequências

- Nova migration (schema `evolutions`), novo módulo de domínio, novo repositório, novas rotas `/api/v1` — expande a superfície do MVP além do que o PRD original delimitava; a nota no PRD deixa essa expansão rastreável.
- Quando a fase 3 (prontuário completo) for implementada, este modelo mínimo precisa de uma migração de dados (adicionar `status` com default `finalizado` para o histórico já existente, ou equivalente) — dívida técnica conhecida e aceita, não escondida.
- `PatientInactiveError` (bloqueio de novo agendamento) não se aplica aqui: evolução é sobre um atendimento que já aconteceu, paciente pode estar inativo e ainda assim ter evoluções históricas consultáveis.
