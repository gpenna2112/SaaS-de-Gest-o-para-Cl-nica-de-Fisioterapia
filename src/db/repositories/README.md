# db/repositories

Repositórios tenant-scoped (ADR-0007).

## `scheduling-repository.ts` (ADR-0015)

Uma `session` é a turma (um fisioterapeuta, uma sala, um horário); quem participa é `session_attendees` (1..N pacientes, até `rooms.capacity`). Quatro operações, todas em transação `SERIALIZABLE`, sem `FOR UPDATE` explícito (a garantia vem do isolamento), retry curto e limitado em `serialization_failure` (`src/db/transaction-retry.ts`):

- `createSession` — cria a turma + os `attendees` iniciais (`patientIds: string[]`, exige ≥1, rejeita duplicatas, valida todos os pacientes antes de escrever); rejeita se a sala/horário já tem outra `session` ativa, se o profissional já tem outra `session` ativa sobreposta, se `patientIds.length > rooms.capacity`, ou se algum paciente está desativado (`PatientInactiveError`, ver `patients-repository.ts`).
- `addAttendee` — adiciona um paciente a uma turma já existente e ativa, respeitando a capacidade e a mesma regra de paciente ativo. Retorna `{ session, attendee }`.
- `rescheduleSession` — move a turma inteira (sala/horário), mantendo o mesmo profissional e todos os `attendees` vinculados; refaz as mesmas checagens de conflito.
- `updateAttendeeStatus` — muda o status de um participante (agendada/confirmada/realizada/falta/cancelada — `session-state-machine.ts`). Cancelar um participante nunca cancela os demais; cancelar o **último** participante ativo cancela a `session` automaticamente, na mesma transação.

Todo método aceita uma `Tx` externa opcional como último parâmetro (ADR-0016): fornecida, o repositório a usa e nunca abre/finaliza transação própria nem aplica retry; omitida, comportamento de sempre.

## `notifications-repository.ts` (ADR-0016)

Outbox vinculado a `session_attendees` (não a `session_id`+`patient_id` soltos). `createConfirmation`, `rescheduleConfirmationsForSession`, `cancelPendingForAttendee`, `markSent`/`markDelivered`/`markFailed`/`recordResponse`. Diferente de `scheduling`, nenhum método precisa de `SERIALIZABLE`/retry próprio — cada operação é uma única instrução atômica (`INSERT` protegido por `UNIQUE(session_attendee_id, template)`, ou `UPDATE` condicional/compare-and-swap). Aceita `Tx` ou `DbClient` indistintamente (`QueryExecutor`).

## `patients-repository.ts`

`createPatient`, `getPatient`, `listPatients`, `updatePatient`, `deactivatePatient`. Nenhum método precisa de `SERIALIZABLE` (sem contagem entre linhas concorrentes) — só atomicidade simples entre a escrita em `patients` e o registro em `audit_log`. `createPatient`/`updatePatient`/`deactivatePatient` geram entrada em `audit_log` (`entity_type = 'patient'`); `deactivatePatient` é idempotente e não tem efeito cascata sobre `scheduling`/`notifications` — ver README de `modules/patients`.

## `professionals-auth-repository.ts` (ADR-0017)

**Não** é tenant-scoped — deliberadamente sem `clinicId` na factory, porque seu propósito é resolver identidade *antes* de a clínica ser conhecida (hook de signup do Better Auth, `getSessionUser`). `findByAuthUserId`, `findUnclaimedByEmail` (pode retornar mais de um resultado — mesmo e-mail em `professionals` de clínicas diferentes é um caso ambíguo real que o chamador deve tratar, nunca escolher um arbitrariamente), `linkAuthUser` (grava `audit_log`, `entity_type = 'professional'`, `action = 'professional.auth_linked'`). Nenhum método precisa de `SERIALIZABLE` — mesma categoria de `patients-repository.ts`, atomicidade simples.

## `modules/scheduling/scheduling-service.ts`

Não é um repositório, mas o que compõe os dois acima: abre uma única transação `SERIALIZABLE` e passa a mesma `Tx` para `scheduling-repository` e `notifications-repository` — criar/remarcar sessão e agendar/reagendar/cancelar a confirmação correspondente são atômicos, ou nenhum acontece.

## Testes de integração (`*.integration.test.ts`)

Cobrem exatamente o que testes unitários não conseguem provar: a garantia de concorrência real sob `SERIALIZABLE`/SSI. Mockar isso testaria só que o código chama um mock corretamente, não que a garantia existe — por isso rodam contra um Postgres de verdade e ficam **fora** de `npm run test` (config separada: `vitest.integration.config.ts`).

**O que este comando NÃO faz:** não sobe, para ou remove nenhum container automaticamente. Os testes de `scheduling`/`notifications`/`patients`/`professionals-auth-repository` se conectam a `TEST_DATABASE_URL` (ou `DATABASE_URL` como fallback) — se a variável não apontar para um Postgres alcançável com as migrations já aplicadas, o teste falha na primeira query com um erro claro, não silenciosamente.

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
