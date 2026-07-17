# scheduling

Agenda, sessões, salas/espaços e as transições de status (`agendada → confirmada → realizada/falta/cancelada`).

Uma `session` é a turma — um fisioterapeuta, uma sala, um horário. Quem participa é `session_attendees` (1 a `rooms.capacity` pacientes). Contém as regras mais críticas do produto (ADR-0015): apenas uma `session` ativa por sala/horário; um profissional não conduz duas `sessions` ativas sobrepostas; cancelar o último `attendee` ativo cancela a `session` automaticamente. Essas garantias são responsabilidade **deste módulo/repositório**, não do banco — validação em transação `SERIALIZABLE` (ADR-0013/0014/0015). Remarcação muta a mesma `session` e move todos os `attendees` junto (nunca cria linha nova, ADR-0010); toda mutação grava em `audit_log`.

**Limites:** não importa nada de `src/app` (Next.js). Não conhece o provedor de notificação (chama `notifications` através de sua interface pública). Não conhece detalhes de auth além de receber o ator já resolvido. `role` do profissional não restringe quem pode ser `professional_id` de uma sessão.

**Status:** único código de domínio implementado até agora é `session-state-machine.ts` — pura, sem I/O (`isValidStatusTransition`, agora escopada a `AttendeeStatus`, o status de um participante). O repositório que a usa está em `src/db/repositories/scheduling-repository.ts` (fora deste módulo, por decisão estrutural — ver `docs/architecture.md`: repositórios tenant-scoped vivem em `db/`, não em `modules/`). Ainda não existe orquestração de nível de serviço (validação de entrada, chamada ao módulo `notifications`, rotas de API, composição de "trocar paciente de turma") — hoje o repositório é chamado diretamente. Ver ADR-0007, ADR-0010, ADR-0013, ADR-0014, ADR-0015.
