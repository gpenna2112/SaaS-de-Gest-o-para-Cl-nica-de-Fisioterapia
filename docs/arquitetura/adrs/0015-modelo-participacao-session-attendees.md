# ADR-0015 — Modelo de participação: `session_attendees`, conflito de sala e de profissional, cancelamento em cascata

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O modelo implementado nos ADR-0013/0014 tratava `sessions` como 1 linha = 1 paciente, com `capacity` limitando **quantas sessões simultâneas** uma sala podia ter. Isso estava errado: uma aula de Pilates é **uma turma** — um fisioterapeuta responsável, uma sala, um horário — com até `rooms.capacity` pacientes participando *da mesma sessão*. O modelo anterior permitia, sem querer, que `capacity` fosse preenchida por sessões de **profissionais diferentes** na mesma sala/horário — nada impedia 3 fisioterapeutas distintos ocupando as 3 vagas do Pilates. Isso não é uma correção de bug pontual; é uma mudança na relação `sessions`↔`patients`, de 1:1 para 1:N.

## Decisão

### Modelo de dados

- **`sessions`** passa a representar a turma: `id, clinic_id, professional_id, room_id, scheduled_start, scheduled_end, status`. `professional_id` continua uma FK única — **exatamente um fisioterapeuta por session**, garantido estruturalmente, como sempre foi. `status` aqui é só `ativa | cancelada` (não o ciclo completo de atendimento).
- **`session_attendees`** (nova tabela): `id, clinic_id, session_id, patient_id, status, confirmed_at`. `status` aqui é o ciclo completo por participante (`agendada → confirmada → realizada/falta/cancelada`, `session-state-machine.ts`, renomeado para `AttendeeStatus`). `UNIQUE(session_id, patient_id)` — um paciente não pode ser adicionado duas vezes à mesma turma.
- **Presença, confirmação e cobrança são individuais** — vivem em `session_attendees`, nunca em `sessions`. Numa turma de Pilates, um paciente pode faltar enquanto outro comparece na mesma aula; cada um recebe sua própria confirmação de WhatsApp.

### Conflitos validados na aplicação (transação `SERIALIZABLE`, sem `EXCLUDE`)

Dois conflitos, ambos checados como *existência* (não mais contagem) dentro da mesma transação de `createSession`/`rescheduleSession`:

1. **Sala**: nenhuma outra `session` com `status = 'ativa'` pode sobrepor o mesmo `room_id` no intervalo pretendido.
2. **Profissional**: nenhuma outra `session` com `status = 'ativa'` pode sobrepor o mesmo `professional_id` no intervalo pretendido — **mesmo em salas diferentes**. Essa regra não existia antes; fecha a lacuna que o modelo anterior deixava aberta.

Mantivemos a decisão do ADR-0013 de **não reviver o `EXCLUDE` constraint** para o conflito de sala/profissional, mesmo esses agora sendo, de novo, regras de "não sobreposição" (o tipo de coisa que `EXCLUDE` resolveria bem): um `EXCLUDE` não enxerga `session_attendees`, então não saberia quando uma `session` ficou vazia e deveria parar de bloquear o horário (ver Cancelamento em cascata, abaixo). Unificar sob o mesmo mecanismo `SERIALIZABLE` já usado para capacidade evita ter dois sistemas de garantia diferentes para o mesmo módulo.

### Capacidade de participantes

`rooms.capacity` agora significa exatamente uma coisa: quantos `session_attendees` **ativos** (`status <> 'cancelada'`) uma `session` pode ter. Checado em `createSession` (contra `patientIds.length`) e em `addAttendee` (contando os já existentes), na mesma transação `SERIALIZABLE`.

### Cancelamento em cascata

Quando um `session_attendee` é cancelado e, depois dessa mudança, **nenhum outro attendee ativo resta** naquela `session`, a `session` é automaticamente marcada `cancelada` — na mesma transação, mesmo ator. Isso é o que impede uma turma esvaziada de bloquear a sala/horário para sempre. Cancelar um `attendee` isoladamente **nunca** cancela os demais — só o cancelamento do último dispara o efeito na `session`.

"Cancelado ou removido" (linguagem usada na decisão de produto) é tratado como a mesma operação — `status = 'cancelada'` em `session_attendees`. Não existe (nem foi criado) um `DELETE` real sobre `session_attendees`, consistente com a imutabilidade de sessões do ADR-0010: histórico de participação nunca é apagado, só transiciona de estado.

### Forma da API do repositório

```
createSession({ professionalId, roomId, scheduledStart, scheduledEnd, patientIds }, actor)
  → { session, attendees }
addAttendee(sessionId, patientId, actor) → attendee
rescheduleSession({ sessionId, roomId, scheduledStart, scheduledEnd }, actor) → session
updateAttendeeStatus(attendeeId, status, actor) → attendee
```

`createSession` recebe `patientIds: string[]` (não um único `patientId`) para não forçar o caso comum (sessão individual, 1 elemento) a duas chamadas: cria a turma e todos os `attendees` iniciais atomicamente. `addAttendee` existe separadamente só para encaixar um paciente numa turma **já existente**. `rescheduleSession` move a turma inteira — sala, horário, mantendo o mesmo profissional e todos os `attendees` vinculados (não altera `session_attendees`).

## Alternativas consideradas

- **Manter `EXCLUDE` para sala/profissional agora que voltaram a ser regras de não-sobreposição** — rejeitada pelo motivo já explicado: não resolve o caso de turma esvaziada sem lógica adicional que o `EXCLUDE` sozinho não expressa.
- **`rescheduleSession` resetar o status de cada `attendee` ativo para `agendada`** (paralelo ao que a versão anterior fazia por sessão): cogitada, mas **não implementada agora** — não foi pedida explicitamente na correção de escopo, e implementá-la sem confirmação replicaria o mesmo tipo de suposição não verificada que motivou este ADR. Fica como decisão em aberto para quando a camada de serviço/UI de remarcação for desenhada.
- **Trocar um paciente de turma como operação única no repositório** (mover um `attendee` de uma `session` para outra) — fora de escopo por decisão explícita: será composta depois (cancelar na turma de origem + `addAttendee` na de destino) pela camada de serviço, não pelo repositório.

## Consequências

- Estrutura antes descrita nos ADR-0013/0014 (contagem de sobreposição de `sessions` para capacidade) fica **superada** por este ADR — capacidade agora conta `session_attendees`, não `sessions`. ADR-0013/0014 recebem nota apontando para cá; não foram reescritos, para preservar o histórico de por que a primeira modelagem foi tentada e por que estava errada.
- Toda a suíte de testes de integração do repositório foi reescrita para o novo modelo, incluindo os três testes de concorrência real (capacidade de attendees, conflito de sala, conflito de profissional) e dois testes sequenciais para o cancelamento em cascata (cancelar não-último attendee não afeta a session; cancelar o último cancela; sala fica livre depois).
- `notifications.session_id + patient_id` não foi alterado — continua correto porque uma notificação é sempre sobre um paciente específico, independente de quantos outros participam da mesma turma; não há necessidade de referenciar `session_attendees.id` diretamente agora, mas vale reconsiderar quando o módulo `notifications` for implementado (a dupla `(session_id, patient_id)` e `session_attendees` descrevem a mesma coisa por caminhos diferentes).
