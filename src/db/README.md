# db

PostgreSQL + Drizzle (ADR-0002, ADR-0003). Schema, migrações SQL e cliente de conexão.

## Estrutura

- `schema/` — tabelas Drizzle: `clinics`, `professionals`, `rooms`, `patients`, `sessions`, `session_attendees`, `notifications`, `audit_log`.
- `migrations/` — SQL gerado por `npm run db:generate` (`0000`), mais uma migration incremental escrita à mão (`0001`, ver nota abaixo), com trechos manuais adicionados onde o builder tipado do Drizzle não expressa (extensão `btree_gist` + dois índices GiST parciais em `sessions`).
- `client.ts` — `createDbClient(connectionString)`, uma factory (sem conexão eager no import). Exporta também `Tx` (transação já aberta) e `QueryExecutor` (`DbClient | Tx`), tipos compartilhados entre repositórios para composição atômica entre módulos.
- `repositories/` — repositórios tenant-scoped (ADR-0007): `scheduling-repository.ts` (ADR-0015) e `notifications-repository.ts` (ADR-0016). Ver `repositories/README.md` para os testes de integração (exigem Postgres real, não rodam em `npm run test`).
- `transaction-retry.ts` — `withSerializableRetry`, genérico e reutilizável por outros repositórios futuros (não é específico de agenda).

## Decisões relevantes que moldam este schema

- **`sessions` é a turma, não um paciente.** Um fisioterapeuta, uma sala, um horário — nunca um `patient_id` diretamente. Quem participa vive em `session_attendees` (1..N pacientes, até `rooms.capacity`). Ver ADR-0015.
- **`sessions.status` é só `ativa`/`cancelada`** — o ciclo completo (agendada/confirmada/realizada/falta) é por participante, em `session_attendees.status`, nunca na turma.
- **Cancelamento em cascata**: quando o último `session_attendee` ativo de uma `session` é cancelado, a `session` é automaticamente marcada `cancelada` — ela deixa de bloquear a sala/horário (ADR-0015).
- **Conflito de sala e de profissional**: sem `EXCLUDE` constraint. Validados na camada de aplicação (transação `SERIALIZABLE`) — uma `session` ativa por sala/horário, um profissional sem `sessions` ativas sobrepostas (mesmo em salas diferentes). Ver ADR-0013/ADR-0014/ADR-0015, que qualificam o ADR-0002. Os dois índices GiST parciais em `sessions` (`WHERE status = 'ativa'`) só aceleram essas consultas, não são garantia por si.
- **Capacidade de attendees**: quantos participantes ativos uma `session` pode ter é `rooms.capacity` — checado na mesma transação `SERIALIZABLE`.
- **Remarcação**: `sessions` é mutável em `room_id`/`scheduled_start`/`scheduled_end` — nunca é recriada, e move a turma inteira (todos os `attendees` continuam vinculados). Nenhum `DELETE` deve ser exposto pelo repositório (ADR-0010) — nem em `sessions`, `session_attendees`, nem `notifications`.
- **`notifications.session_attendee_id`** — não `session_id`+`patient_id` soltos. Uma confirmação é sempre sobre uma participação específica (ADR-0016).
- **Transação compartilhada entre repositórios**: `scheduling-repository` e `notifications-repository` aceitam uma `Tx` externa opcional em todo método — permite compor operações atômicas entre módulos (`modules/scheduling/scheduling-service.ts`) sem que um repositório importe o outro. Sem `Tx` externa, cada um mantém seu comportamento padrão.
- **`professionals.auth_user_id`**: nullable, sem FK enforçada. As tabelas do Better Auth são geridas por um sistema de migração próprio; revisitar quando o módulo `auth` for implementado (ADR-0006).
- **Enums como `text` + `CHECK`**, não `ENUM` nativo do Postgres — mais barato de alterar via migration enquanto o domínio evolui.

## Nota sobre a migration `0001`

`drizzle-kit generate` exige resolução interativa (TTY) quando a diferença de schema é ambígua entre "coluna renomeada" e "coluna removida + coluna nova" — o caso de `notifications` trocando `session_id`+`patient_id` por `session_attendee_id`. Sem TTY neste ambiente, a migration e o snapshot (`meta/0001_snapshot.json`) foram escritos manualmente. Validado em duas frentes: `drizzle-kit generate` rodado de novo confirma "No schema changes, nothing to migrate" (o snapshot bate exatamente com o schema TypeScript); e a migration foi aplicada de ponta a ponta contra um Postgres real, com inserts de sanidade e testes negativos dos novos constraints.

## O que ainda não existe aqui

Adapters de canal reais de `notifications` (Meta Cloud API, wa.me), worker pg-boss (`src/jobs`), rotas de API. `modules/notifications` e `modules/scheduling` têm as peças de domínio puro e a orquestração (`scheduling-service.ts`) — nenhuma rota de API expõe nada disso ainda.
