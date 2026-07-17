# db

PostgreSQL + Drizzle (ADR-0002, ADR-0003). Schema, migrações SQL e cliente de conexão.

## Estrutura

- `schema/` — tabelas Drizzle: `clinics`, `professionals`, `rooms`, `patients`, `sessions`, `session_attendees`, `notifications`, `audit_log`.
- `migrations/` — SQL gerado por `npm run db:generate`, com um trecho manual adicionado (extensão `btree_gist` + dois índices GiST parciais em `sessions`, que o builder tipado do Drizzle não expressa).
- `client.ts` — `createDbClient(connectionString)`, uma factory (sem conexão eager no import). Consumido por `repositories/scheduling-repository.ts`.
- `repositories/` — repositórios tenant-scoped (ADR-0007). `scheduling-repository.ts` implementa o modelo de `ADR-0015` (session = turma, session_attendees = participantes). Ver `repositories/README.md` para os testes de integração (exigem Postgres real, não rodam em `npm run test`).
- `transaction-retry.ts` — `withSerializableRetry`, genérico e reutilizável por outros repositórios futuros (não é específico de agenda).

## Decisões relevantes que moldam este schema

- **`sessions` é a turma, não um paciente.** Um fisioterapeuta, uma sala, um horário — nunca um `patient_id` diretamente. Quem participa vive em `session_attendees` (1..N pacientes, até `rooms.capacity`). Ver ADR-0015.
- **`sessions.status` é só `ativa`/`cancelada`** — o ciclo completo (agendada/confirmada/realizada/falta) é por participante, em `session_attendees.status`, nunca na turma.
- **Cancelamento em cascata**: quando o último `session_attendee` ativo de uma `session` é cancelado, a `session` é automaticamente marcada `cancelada` — ela deixa de bloquear a sala/horário (ADR-0015).
- **Conflito de sala e de profissional**: sem `EXCLUDE` constraint. Validados na camada de aplicação (transação `SERIALIZABLE`) — uma `session` ativa por sala/horário, um profissional sem `sessions` ativas sobrepostas (mesmo em salas diferentes). Ver ADR-0013/ADR-0014/ADR-0015, que qualificam o ADR-0002. Os dois índices GiST parciais em `sessions` (`WHERE status = 'ativa'`) só aceleram essas consultas, não são garantia por si.
- **Capacidade de attendees**: quantos participantes ativos uma `session` pode ter é `rooms.capacity` — checado na mesma transação `SERIALIZABLE`.
- **Remarcação**: `sessions` é mutável em `room_id`/`scheduled_start`/`scheduled_end` — nunca é recriada, e move a turma inteira (todos os `attendees` continuam vinculados). Nenhum `DELETE` deve ser exposto pelo repositório (ADR-0010) — nem em `sessions`, nem em `session_attendees`.
- **`professionals.auth_user_id`**: nullable, sem FK enforçada. As tabelas do Better Auth são geridas por um sistema de migração próprio; revisitar quando o módulo `auth` for implementado (ADR-0006).
- **Enums como `text` + `CHECK`**, não `ENUM` nativo do Postgres — mais barato de alterar via migration enquanto o domínio evolui.

## O que ainda não existe aqui

Nenhuma camada de serviço/orquestração acima do repositório (validação de entrada, cálculo de `scheduled_end` a partir da duração padrão da clínica, chamada ao módulo `notifications` após criar uma sessão, composição de "trocar paciente de turma" a partir de cancelar+adicionar). Isso é responsabilidade de `modules/scheduling`, que hoje só tem a máquina de estados pura (`session-state-machine.ts`, agora escopada a `session_attendees`). Nenhuma rota de API expõe o repositório ainda.
