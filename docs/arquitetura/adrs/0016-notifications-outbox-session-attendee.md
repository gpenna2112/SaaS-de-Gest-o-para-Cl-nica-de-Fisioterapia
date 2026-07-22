# ADR-0016 — Módulo `notifications`: vínculo por `session_attendee`, idempotência, atomicidade com `scheduling`

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O ADR-0009 decidiu o outbox de notificações (tabela + adapters de canal), mas a tabela original vinculava cada notificação a `session_id` + `patient_id` soltos — desenhada antes do ADR-0015 (sessão como turma, `session_attendees` como participantes). Esta etapa implementa o módulo de fato: schema corrigido, repositório, e a composição atômica com `scheduling` (criar uma sessão e agendar a confirmação de cada participante é uma operação só, nunca duas).

## Decisão

### 1. Vínculo por `session_attendee_id`, não `session_id` + `patient_id`

`notifications.session_attendee_id` (FK única para `session_attendees.id`) substitui o par solto. Razão: uma confirmação é sempre sobre uma participação específica — a granularidade de F2 é por participante, não por sessão nem por paciente isoladamente. A FK única garante por construção que o par sessão+paciente referenciado existiu de fato; dois FKs soltos não davam essa garantia.

### 2. Estados: `pendente → enviada → entregue/falha → respondida`, mais `cancelada`

Adicionado `cancelada` ao enum original do ADR-0009 — necessário para representar uma confirmação que nunca deveria ser enviada (sessão/participante cancelados antes do disparo). Sem esse estado, não haveria como distinguir "nunca vamos mandar isso" de "ainda pendente de mandar". Máquina de estados pura em `modules/notifications/notification-state-machine.ts`, mesmo padrão do `session-state-machine.ts` de scheduling.

### 3. Idempotência: `UNIQUE(session_attendee_id, template)` + INSERT simples (não upsert)

Plano original prescrevia um upsert (`ON CONFLICT DO UPDATE`) para reagendamento. Na implementação, ficou claro que isso era desnecessário: como remarcação é tratada por uma operação bulk separada (`rescheduleConfirmationsForSession`, item 4) que só atualiza linhas `pendente` existentes, e como `addAttendee`/`createSession` já impedem um mesmo paciente ser adicionado duas vezes à mesma sessão (`PatientAlreadyAttendingError`), **nunca existe um caminho legítimo onde `createConfirmation` seria chamado duas vezes para o mesmo `session_attendee_id`**. Simplificado para um `INSERT` simples; a `UNIQUE` constraint fica como defesa em profundidade — se algum dia isso acontecer, é sinal de bug em código chamador, e deve estourar alto (violação de constraint), não ser silenciosamente absorvida por um `ON CONFLICT`.

Para o envio (`markSent`/`markDelivered`/`markFailed`/`recordResponse`): compare-and-swap via `UPDATE ... WHERE status IN (predecessores válidos) RETURNING *`, nunca `SELECT` seguido de `UPDATE` separado. Os predecessores válidos são derivados da mesma tabela de transições (`predecessorsOf`), não hardcoded por método — uma fonte única de verdade. Diferente do `scheduling-repository`, **nenhum método aqui precisa de `SERIALIZABLE`/retry próprio**: cada operação é uma única instrução atômica (INSERT protegido por `UNIQUE`, ou UPDATE condicional), não há padrão "ler N linhas, validar, escrever" que precise de proteção SSI.

### 4. Momento de criação e de reagendamento

Confirmação é criada no momento de `createSession`/`addAttendee` (não por job de varredura), com `scheduled_for` = 08:00 (fuso da clínica) do dia da sessão — `computeConfirmationScheduledFor`, função pura usando `Intl.DateTimeFormat` (sem dependência de biblioteca de fuso horário; América/São_Paulo é UTC-3 fixo desde que o Brasil aboliu horário de verão em 2019 — assumido e documentado no código).

Remarcação (`rescheduleSession`) não recria notificações — `rescheduleConfirmationsForSession(sessionId, novoScheduledFor)` faz um único `UPDATE` bulk sobre as notificações **pendentes** dos participantes daquela sessão. Confirmadas confirmação **não é resetada por remarcação**: quem já respondeu, já foi notificado ou já cancelou não é reaberto — decisão explícita, distinta de "resetar o status do attendee" (que o ADR-0015 já deixou de fora do escopo). Cancelamento de um participante (`updateAttendeeStatus → cancelada`) cancela só a notificação pendente daquele participante especificamente (`cancelPendingForAttendee`) — nunca as dos demais.

### 5. Atomicidade com `scheduling`: transação compartilhada

`scheduling-repository.ts` foi refatorado: todo método aceita uma `Tx` externa opcional como último parâmetro.
- **Fornecida**: o repositório a usa diretamente, nunca abre/finaliza transação própria, nunca aplica retry (a política de retry passa a ser responsabilidade de quem abriu a `Tx`).
- **Omitida**: comportamento de sempre — abre a própria transação `SERIALIZABLE` com `withSerializableRetry`.

`notifications-repository.ts` segue o mesmo padrão, mas com tipo mais permissivo (`QueryExecutor = DbClient | Tx`, já que nenhum de seus métodos precisa de `SERIALIZABLE` isoladamente).

Um novo módulo, `modules/scheduling/scheduling-service.ts`, orquestra os dois repositórios: abre uma única transação `SERIALIZABLE`, chama `schedulingRepository.X(..., tx)` e depois `notificationsRepository.Y(..., tx)`, e devolve o resultado. Se qualquer passo falhar, a transação inteira reverte — sessão, participantes e confirmações são criados/alterados atomicamente, ou nenhum é.

## Alternativas consideradas

- **Duas chamadas separadas, sem transação compartilhada** (Opção B do plano original) — rejeitada: abriria uma janela real, ainda que rara, de sessão criada sem confirmação agendada se o processo caísse entre as duas chamadas. A F2 é a feature mais crítica do MVP; essa janela era inaceitável.
- **Upsert (`ON CONFLICT DO UPDATE`) para criação de confirmação** — cogitada no plano original, descartada na implementação (ver item 3) por não ter nenhum caminho de chamada real que a justificasse, uma vez que remarcação virou uma operação bulk separada.
- **`notifications-repository` com `SERIALIZABLE`/retry próprio, simetricamente a `scheduling`** — rejeitada: nenhuma de suas operações tem o padrão ler-validar-escrever que exige SSI; adicionar a máquina de retry ali seria complexidade sem propósito.

## Consequências

- `scheduling-repository.ts` teve sua assinatura pública alterada (parâmetro `tx` opcional em todos os métodos; `addAttendee` agora retorna `{ session, attendee }` em vez de só `attendee`, para a `scheduling-service` conseguir calcular `scheduledFor` sem uma consulta extra). Testes de integração existentes não quebraram porque nenhum dependia do formato antigo de retorno de `addAttendee`.
- `patients.phone` nulo faz `createConfirmation` retornar `null` (não lança erro) — F2 simplesmente não dispara automaticamente para esse paciente; testado explicitamente.
- Migration incremental `0001_notifications_session_attendee.sql`: `drizzle-kit generate` exigiu resolução interativa de ambiguidade coluna-renomeada-ou-não (ambiente sem TTY não permite); a migration e o snapshot correspondente (`meta/0001_snapshot.json`) foram escritos manualmente, e validados de duas formas — (1) rodar `drizzle-kit generate` de novo confirma "No schema changes, nothing to migrate", provando que o snapshot bate exatamente com o schema TypeScript; (2) aplicar `0000`+`0001` em sequência contra um Postgres real e testar a cadeia completa de inserts mais os dois constraints novos (`UNIQUE`, `CHECK` com `cancelada`).
- Testes de integração passaram a rodar com `fileParallelism: false` (`vitest.integration.config.ts`) — múltiplos arquivos de teste concorrentes batendo no mesmo Postgres de teste inflavam artificialmente a taxa de `serialization_failure` (40001 genuíno, mas por uma causa que não existe em produção: concorrência entre suítes sem relação lógica entre si, não entre requisições reais). Rodar arquivos sequencialmente elimina esse ruído sem tocar na política de retry do código de produção (que continua deliberadamente pequena — 3 tentativas).
