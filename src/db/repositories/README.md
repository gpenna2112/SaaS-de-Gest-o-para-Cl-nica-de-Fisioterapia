# db/repositories

Repositórios tenant-scoped (ADR-0007).

## `scheduling-repository.ts` (ADR-0015)

Uma `session` é a turma (um fisioterapeuta, uma sala, um horário); quem participa é `session_attendees` (1..N pacientes, até `rooms.capacity`). Quatro operações, todas em transação `SERIALIZABLE`, sem `FOR UPDATE` explícito (a garantia vem do isolamento), retry curto e limitado em `serialization_failure` (`src/db/transaction-retry.ts`):

- `createSession` — cria a turma + os `attendees` iniciais (`patientIds: string[]`, exige ≥1, rejeita duplicatas, valida todos os pacientes antes de escrever); rejeita se a sala/horário já tem outra `session` ativa, se o profissional já tem outra `session` ativa sobreposta, se `patientIds.length > rooms.capacity`, ou se algum paciente está desativado (`PatientInactiveError`, ver `patients-repository.ts`).
- `addAttendee` — adiciona um paciente a uma turma já existente e ativa, respeitando a capacidade e a mesma regra de paciente ativo. Retorna `{ session, attendee }`.
- `rescheduleSession` — move a turma inteira (sala/horário), mantendo o mesmo profissional e todos os `attendees` vinculados; refaz as mesmas checagens de conflito **e** valida que a sala de destino comporta o nº de participantes ativos da turma (`RoomAtCapacityError`, mesma regra de `addAttendee` — encontrado e corrigido ao expor a remarcação via API: antes só validava conflito de horário/profissional, não capacidade).
- `updateAttendeeStatus` — muda o status de um participante (agendada/confirmada/realizada/falta/cancelada — `session-state-machine.ts`). Cancelar um participante nunca cancela os demais; cancelar o **último** participante ativo cancela a `session` automaticamente, na mesma transação.

Leituras adicionais (sem `SERIALIZABLE`, só listagem): `listSessions` (dia, já usada por `/agenda`), `countCancelledAttendees` (turmas canceladas por completo não aparecem em `listSessions`, ver ADR-0015), `getAttendee` (usada pelo módulo `evolutions` para validar status sem importar `session_attendees`), `listAttendanceHistoryForPatient` (histórico completo de um paciente, qualquer status, para `/pacientes/[id]`).

Todo método aceita uma `Tx` externa opcional como último parâmetro (ADR-0016): fornecida, o repositório a usa e nunca abre/finaliza transação própria nem aplica retry; omitida, comportamento de sempre.

## `notifications-repository.ts` (ADR-0016)

Outbox vinculado a `session_attendees` (não a `session_id`+`patient_id` soltos). `createConfirmation`, `rescheduleConfirmationsForSession`, `cancelPendingForAttendee`, `markSent`/`markDelivered`/`markFailed`/`recordResponse`. Diferente de `scheduling`, nenhum método precisa de `SERIALIZABLE`/retry próprio — cada operação é uma única instrução atômica (`INSERT` protegido por `UNIQUE(session_attendee_id, template)`, ou `UPDATE` condicional/compare-and-swap). Aceita `Tx` ou `DbClient` indistintamente (`QueryExecutor`).

## `patients-repository.ts`

`createPatient`, `getPatient`, `listPatients`, `updatePatient`, `deactivatePatient`, `reactivatePatient`. Nenhum método precisa de `SERIALIZABLE` (sem contagem entre linhas concorrentes) — só atomicidade simples entre a escrita em `patients` e o registro em `audit_log`. `createPatient`/`updatePatient`/`deactivatePatient`/`reactivatePatient` geram entrada em `audit_log` (`entity_type = 'patient'`); os dois toggles são idempotentes e não têm efeito cascata sobre `scheduling`/`notifications` — ver README de `modules/patients`.

## `professionals-repository.ts` / `rooms-repository.ts`

Mesmo padrão entre si: `listProfessionals`/`listRooms` (leitura, já existiam) + `createProfessional`/`createRoom`, `updateProfessional`/`updateRoom`, `deactivate`/`reactivate` — espelham `patients-repository.ts` (audit_log, toggles idempotentes). Rotas `POST`/`PATCH` restritas a `role = "gestora"` via `requireRole` (ADR-0017 §3 — primeiro uso real desse guard no projeto; `GET` continua aberto a qualquer profissional logado). UI em `/equipe`.

**Unicidade (e-mail em `professionals`, nome em `rooms`), por clínica: pré-checagem + captura da constraint real, nunca só uma das duas.** `assertEmailAvailable`/`assertNameAvailable` fazem um `SELECT` de validação antes do `INSERT`/`UPDATE` (sob isolamento padrão, não `SERIALIZABLE` — não há necessidade de ler múltiplas linhas para decidir uma transição de estado aqui, diferente do caso de gestoras abaixo). Esse pré-check por si só não fecha a janela de corrida entre duas requisições concorrentes idênticas: a garantia real vem da constraint `UNIQUE(clinic_id, email|name)` no banco. O `INSERT`/`UPDATE` fica em `try/catch`; `isUniqueViolation` (`src/db/postgres-errors.ts`, compartilhado pelos dois repositórios) confirma SQLSTATE `23505` **e** o nome exato da constraint (`professionals_clinic_email_unique` / `rooms_clinic_name_unique`) andando até 3 níveis de `.cause` — o `db.transaction()` do drizzle-orm embrulha o `PostgresError` real num erro próprio, mesmo padrão já documentado em `transaction-retry.ts` para `serialization_failure`; checar só o erro direto não detecta a violação em todos os casos (encontrado ao testar o caminho de `update`, não só o de `create`). Convertida, vira o mesmo erro de domínio que o pré-check já lançaria (`DuplicateProfessionalEmailError`/`DuplicateRoomNameError`), nunca um erro cru do driver escapando para `error-response.ts` como 500. Testado com concorrência real (`Promise.allSettled` disparando duas escritas de verdade contra Postgres) em `*.integration.test.ts`, tanto para criação quanto para atualização de e-mail/nome.

**`professionals`: invariante "pelo menos uma gestora ativa por clínica" — protegida sob `SERIALIZABLE`, não só pré-check.** Diferente da unicidade acima, não existe constraint de banco equivalente para servir de backstop (não há como expressar essa regra como um `CHECK`/`UNIQUE` simples). `deactivateProfessional` e `updateProfessional` (quando o `role` muda de `"gestora"` para outro, com a gestora ainda ativa) leem o conjunto de gestoras ativas da clínica antes de escrever (`assertNotLastActiveGestora`) — sem essa leitura rodar sob `SERIALIZABLE`, duas requisições concorrentes removendo as duas últimas gestoras simultaneamente poderiam ambas passar no pré-check. Por isso, sem `Tx` externa, essas duas operações abrem sua própria transação com `isolationLevel: "serializable"` e usam `withSerializableRetry` (`src/db/transaction-retry.ts`) exatamente como `scheduling-repository.ts` — duas transações que leem esse mesmo conjunto e escrevem sobre linhas que o predicado da outra leu formam um ciclo que o Postgres detecta via SSI, abortando uma com `serialization_failure` (`40001`); o retry relê o estado do zero, então a segunda tentativa vê a gestora já desativada pela outra transação e falha corretamente com `LastGestoraError` (nunca um `SchedulingConflictError` de agenda, que não tem relação com profissionais). Esgotadas as tentativas de retry por um conflito diferente, lança `ProfessionalsWriteConflictError` — mapeado para 409, assim como `LastGestoraError`. Testado com concorrência real (duas gestoras ativas, removidas simultaneamente combinando desativação e rebaixamento).

**`Tx` externa: o chamador decide a política transacional do conjunto.** Igual ao resto do projeto (ADR-0016) — se uma `Tx` já aberta for passada para `createProfessional`/`updateProfessional`/`deactivateProfessional`/`reactivateProfessional`, o repositório **não** abre transação própria, não aplica `SERIALIZABLE` e não faz retry; quem compôs a `Tx` externa (ex.: uma futura camada de serviço) é responsável por já tê-la aberto com o isolamento adequado antes de chamar. Isso é deliberado, não uma lacuna: nenhum ponto do projeto hoje compõe `professionals` com outro módulo numa `Tx` compartilhada, mas o contrato já segue o mesmo padrão de `scheduling-repository.ts`/`notifications-repository.ts` para quando isso existir.

## `evolutions-repository.ts` (ADR-0019)

Evolução clínica mínima — ver `src/modules/evolutions/README.md`.

## `professionals-auth-repository.ts` (ADR-0017)

**Não** é tenant-scoped — deliberadamente sem `clinicId` na factory, porque seu propósito é resolver identidade *antes* de a clínica ser conhecida (hook de signup do Better Auth, `getSessionUser`). `findByAuthUserId`, `findUnclaimedByEmail` (pode retornar mais de um resultado — mesmo e-mail em `professionals` de clínicas diferentes é um caso ambíguo real que o chamador deve tratar, nunca escolher um arbitrariamente), `linkAuthUser` (grava `audit_log`, `entity_type = 'professional'`, `action = 'professional.auth_linked'`). Nenhum método precisa de `SERIALIZABLE` — mesma categoria de `patients-repository.ts`, atomicidade simples.

## `modules/scheduling/scheduling-service.ts`

Não é um repositório, mas o que compõe os dois acima: abre uma única transação `SERIALIZABLE` e passa a mesma `Tx` para `scheduling-repository` e `notifications-repository` — criar/remarcar sessão e agendar/reagendar/cancelar a confirmação correspondente são atômicos, ou nenhum acontece.

## Testes de integração (`*.integration.test.ts`)

Cobrem exatamente o que testes unitários não conseguem provar: a garantia de concorrência real sob `SERIALIZABLE`/SSI. Mockar isso testaria só que o código chama um mock corretamente, não que a garantia existe — por isso rodam contra um Postgres de verdade e ficam **fora** de `npm run test` (config separada: `vitest.integration.config.ts`).

**O que este comando NÃO faz:** não sobe, para ou remove nenhum container automaticamente. Os testes de `scheduling`/`notifications`/`patients`/`professionals`/`rooms`/`evolutions`/`professionals-auth-repository` se conectam a `TEST_DATABASE_URL` (ou `DATABASE_URL` como fallback) — se a variável não apontar para um Postgres alcançável com as migrations já aplicadas, o teste falha na primeira query com um erro claro, não silenciosamente.

**Exceção:** `src/modules/auth/session.integration.test.ts` exercita o Better Auth de ponta a ponta (`getAuth().api.signUpEmail`, hook de provisionamento), e `better-auth-instance.ts` monta seu próprio cliente de banco a partir de `getEnv().DATABASE_URL` (via `src/lib/env.ts`, que exige a variável, sem fallback para `TEST_DATABASE_URL`) — então rodar a suíte completa exige **`DATABASE_URL` explicitamente setada** (não basta `TEST_DATABASE_URL`), além de `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`.

### Como rodar

Você precisa de um Postgres alcançável, com **as duas** migrations aplicadas (domínio e Better Auth), antes de rodar `npm run test:integration`. Exemplo de setup local descartável (execute manualmente — nenhuma automação faz isso por você):

```bash
docker run --rm -d --name clinic-mgmt-test-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clinic_management_test \
  -p 5433:5432 postgres:16-alpine

export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/clinic_management_test
export DATABASE_URL=$TEST_DATABASE_URL
export BETTER_AUTH_SECRET=qualquer-string-com-pelo-menos-32-caracteres
export BETTER_AUTH_URL=http://localhost:3000

npx drizzle-kit migrate
npx drizzle-kit migrate --config drizzle.auth.config.ts

npm run test:integration

docker rm -f clinic-mgmt-test-db
```

### Isolamento e limpeza

Cada teste cria sua própria `clinic` (com pacientes/salas/profissionais vinculados a ela) em `beforeEach` e apaga tudo daquela `clinic_id` em `afterEach` (ordem reversa de FK: `audit_log` → `sessions` → `patients`/`rooms` → `professionals` → `clinics`). Cenários não compartilham dados entre si mesmo rodando na mesma instância de banco.
