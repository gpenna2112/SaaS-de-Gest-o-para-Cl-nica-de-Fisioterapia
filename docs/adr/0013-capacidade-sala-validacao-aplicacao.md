# ADR-0013 — Validação de capacidade de sala na camada de aplicação (qualifica ADR-0002)

- **Status:** Aceito · escopo estendido, parâmetros de retry e estratégia de teste detalhados no [ADR-0014](0014-concorrencia-scheduling-escopo-retry-testes.md) · **algoritmo de capacidade corrigido pelo [ADR-0015](0015-modelo-participacao-session-attendees.md)**
- **Data:** 2026-07-17

> **Nota de correção (2026-07-17):** o algoritmo abaixo descreve capacidade como contagem de `sessions` sobrepostas numa sala — isso presumia 1 sessão = 1 paciente, o que estava errado (uma turma de Pilates é 1 sessão com N pacientes, não N sessões). O ADR-0015 corrige isso: `sessions` passa a ser a turma (1 profissional, 1 sala, 1 horário) e `capacity` conta `session_attendees` ativos daquela sessão, não sessões sobrepostas. O mecanismo (transação `SERIALIZABLE`, sem `EXCLUDE`) continua válido; o que mudou é o que está sendo contado.

## Contexto

A capacidade das salas deixou de ser implicitamente 1 (PRD original: "impossível agendar duas fisios na mesma sala no mesmo horário"). Por decisão explícita do produto, `rooms.capacity` passa a ser um campo genérico e configurável — salas individuais com capacidade 1, a sala de Pilates com capacidade 3, sem regra de negócio específica por tipo de sala. A validação de ocupação deve usar apenas essa capacidade.

O mecanismo do ADR-0002 (`EXCLUDE USING gist`) só expressa "nenhuma sobreposição" — matematicamente o caso `capacity = 1`. O Postgres não tem uma primitiva declarativa nativa equivalente a "no máximo N sobreposições" para N > 1. Generalizar a regra exige sair do domínio de um constraint estático.

## Decisão

A ocupação da sala é validada na **camada de aplicação** (repositório do módulo `scheduling`, ainda não implementado — este ADR documenta o mecanismo que a implementação deverá seguir), dentro de uma transação com isolamento **`SERIALIZABLE`**:

1. Lê `capacity` da sala.
2. Conta sessões ativas (`status <> 'cancelada'`) daquela sala cujo intervalo `[scheduled_start, scheduled_end)` sobrepõe o horário pretendido.
3. Se `count >= capacity`, rejeita (erro de domínio "sala sem vaga neste horário").
4. Caso contrário, grava (insere ou atualiza, no caso de remarcação — ADR-0010).

Sob `SERIALIZABLE`, o Postgres detecta e aborta automaticamente qualquer corrida entre duas transações concorrentes que juntas estourariam a capacidade (`serialization_failure`, SQLSTATE `40001`); o repositório deve tratar esse erro com uma nova tentativa (retry).

Não há tratamento especial por `rooms.type` — a mesma lógica vale para capacidade 1 ou N.

## Alternativas consideradas

- **Trigger de constraint em PL/pgSQL** (`BEFORE INSERT OR UPDATE ON sessions`, travando a linha da sala e contando sobreposições): preserva ao pé da letra a garantia "no banco" do ADR-0002, inclusive contra código futuro que escreva direto na tabela. Rejeitada por ora: é exatamente o tipo de "código inteligente" que o princípio do projeto (simplicidade acima de código inteligente) pede para evitar por padrão, é mais difícil de testar/depurar a partir do TypeScript, e o domínio ainda está em evolução — mudar uma função PL/pgSQL tem mais atrito que mudar uma função TypeScript. Fica registrada como opção a reconsiderar se o volume de escrita concorrente crescer ou se surgir um caso real de violação por acesso fora do repositório.

## Consequências

- **Qualifica o ADR-0002**: o mecanismo de `EXCLUDE USING gist` descrito lá não é mais usado — nenhuma sala, nem as de capacidade 1, depende de exclusion constraint. A escolha de PostgreSQL, JSONB e o restante do ADR-0002 continuam válidos; só o mecanismo específico de conflito de sala muda. ADR-0002 foi anotado apontando para este ADR.
- A garantia de capacidade depende de todo acesso passar pelo repositório tenant-scoped — já é uma exigência do ADR-0007 ("nenhuma query crua no domínio"), então não é uma responsabilidade nova, apenas mais uma regra que se apoia nela.
- Testável em TypeScript com testes de integração contra um Postgres real (não é possível validar `SERIALIZABLE`/corrida de forma significativa com mocks).
- Fica um risco documentado: se algum código futuro escrever na tabela `sessions` fora do repositório (violando o ADR-0007), a garantia de capacidade não se aplica. Mitigação existente é a mesma do ADR-0007 (disciplina de acesso via repositório), não uma nova.
