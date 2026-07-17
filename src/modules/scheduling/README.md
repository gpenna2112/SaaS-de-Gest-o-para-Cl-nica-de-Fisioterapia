# scheduling

Agenda, sessões, salas/espaços e as transições de status (`agendada → confirmada → realizada/falta/cancelada`).

Uma `session` é a turma — um fisioterapeuta, uma sala, um horário. Quem participa é `session_attendees` (1 a `rooms.capacity` pacientes). Contém as regras mais críticas do produto (ADR-0015): apenas uma `session` ativa por sala/horário; um profissional não conduz duas `sessions` ativas sobrepostas; cancelar o último `attendee` ativo cancela a `session` automaticamente. Essas garantias são responsabilidade **deste módulo/repositório**, não do banco — validação em transação `SERIALIZABLE` (ADR-0013/0014/0015). Remarcação muta a mesma `session` e move todos os `attendees` junto (nunca cria linha nova, ADR-0010); toda mutação grava em `audit_log`.

**Limites:** não importa nada de `src/app` (Next.js). Não conhece o provedor de notificação — chama `notifications` através de sua interface pública (`NotificationsRepository`), nunca um adapter de canal diretamente. Não conhece detalhes de auth além de receber o ator já resolvido. `role` do profissional não restringe quem pode ser `professional_id` de uma sessão.

**Código implementado:**
- `session-state-machine.ts` — pura, sem I/O (`isValidStatusTransition`, escopada a `AttendeeStatus`, o status de um participante).
- `scheduling-service.ts` — orquestra `scheduling-repository` + `notifications-repository` numa única transação `SERIALIZABLE`: criar/adicionar sessão e agendar a confirmação são atômicos (ADR-0016) — ou os dois acontecem, ou nenhum. Canal fixo em `whatsapp_cloud_api` por ora (simplificação assumida, ver README de `notifications`).

O repositório de persistência está em `src/db/repositories/scheduling-repository.ts` (fora deste módulo, por decisão estrutural — ver `docs/architecture.md`: repositórios tenant-scoped vivem em `db/`, não em `modules/`). Todo método do repositório aceita uma transação externa opcional, para composição atômica entre repositórios de módulos diferentes (ADR-0016) — sem ela, comportamento de sempre (`SERIALIZABLE` + retry próprio).

**Ainda não implementado:** validação de entrada de nível de API, rotas de API, composição de "trocar paciente de turma" (cancelar numa turma + adicionar em outra). Ver ADR-0007, ADR-0010, ADR-0013, ADR-0014, ADR-0015, ADR-0016.
