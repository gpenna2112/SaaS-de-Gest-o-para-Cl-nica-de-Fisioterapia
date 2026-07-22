# ADR-0014 — Controle de concorrência em `scheduling`: escopo, política de retry e estratégia de teste

- **Status:** Aceito · escopo das operações e regras de conflito redesenhados no [ADR-0015](0015-modelo-participacao-session-attendees.md) (session_attendees); a política de retry (limite de tentativas, backoff, distinção de erros, estratégia de teste) descrita aqui continua valendo sem alteração.
- **Data:** 2026-07-17

## Contexto

O ADR-0013 decidiu *que* a capacidade de sala seria validada em transação `SERIALIZABLE` na camada de aplicação, mas descreveu o algoritmo especificamente para o caso de capacidade — não cobre outras mutações de `sessions` nem define parâmetros concretos de retry. Durante a implementação, identificamos uma segunda corrida de dados que precisa da mesma disciplina transacional mas não envolve capacidade:

**Corrida de status:** duas requisições concorrentes lendo `status = 'agendada'` fora de uma transação isolada — uma tentando marcar `realizada`, outra `falta` — sob `READ COMMITTED` a segunda escrita simplesmente sobrescreve a primeira sem erro, produzindo um estado que nunca deveria existir (a sessão "vira" o que a última requisição escreveu, silenciosamente).

Isso levanta três questões que o ADR-0013 não respondia e que precisam de resposta explícita antes do commit desta implementação: até onde vai o escopo do controle de concorrência, com que parâmetros exatos o retry opera, e como essa garantia é verificada de forma confiável.

## Decisão

### 1. Escopo: toda mutação de `sessions` que lê-para-validar-depois-escreve

`SchedulingRepository.createSession`, `rescheduleSession` e `updateSessionStatus` — as três — rodam dentro de transação `SERIALIZABLE`, não só as duas que envolvem capacidade. A regra geral: **qualquer operação do repositório que precise ler o estado atual para decidir se a escrita é válida usa esse mecanismo**, porque a alternativa (validar fora da transação) está sujeita a leitura obsoleta entre a validação e a escrita, independentemente de a regra violada ser "capacidade" ou "transição de status válida".

`updateSessionStatus` lê o `status` atual **dentro** da transação e valida via `isValidStatusTransition` (função pura, `src/modules/scheduling/session-state-machine.ts`) antes de escrever — a mesma leitura-then-escrita protegida por SSI que o caso de capacidade usa.

Sem `FOR UPDATE` explícito em nenhum caso (create, reschedule, status): a garantia vem inteiramente da detecção de conflito por predicado do isolamento `SERIALIZABLE` (SSI). Travar linhas manualmente seria redundante com SSI e mais código sem benefício — confirmado como decisão consciente, não omissão.

### 2. Política de retry

- **Limite explícito: 3 tentativas totais** (`MAX_ATTEMPTS`, `src/db/transaction-retry.ts`). Nunca retry infinito.
- **Backoff curto entre tentativas**: `20ms × tentativa + jitter aleatório de até 20ms`. Suficiente para não martelar o banco em corridas raras, sem introduzir latência perceptível dado o volume real (4 profissionais agendando manualmente, não um sistema de alta concorrência).
- **Só retry em `serialization_failure` (SQLSTATE `40001`)**, verificado por `error instanceof PostgresError && error.code === "40001"`. Qualquer outro erro propaga imediatamente, sem retry — inclusive erros de domínio como `RoomAtCapacityError`, `InvalidStatusTransitionError`, `SessionNotFoundError`.
- **Esgotadas as tentativas, lança `SchedulingConflictError`** — distinta de `RoomAtCapacityError`: a primeira é uma corrida transitória de concorrência (o chamador deveria oferecer "tente novamente"), a segunda é uma regra de negócio genuína (o chamador deveria oferecer "escolha outro horário"). Confundir as duas no mesmo tipo de erro obrigaria a UI a dar a mesma resposta para dois problemas diferentes.

### 3. Estratégia de teste

`SERIALIZABLE`/SSI não é verificável de forma significativa com mocks — mockar provaria só que o código chama o mock corretamente, não que a garantia de concorrência existe sob corrida real. Por isso:

- Testes de integração (`*.integration.test.ts`) rodam contra Postgres real, em **config e comando separados** dos testes unitários (`vitest.integration.config.ts` / `npm run test:integration`) — nunca misturados com `npm run test`.
- **Nenhuma automação de ciclo de vida de container dentro do código de teste.** O teste exige `TEST_DATABASE_URL` (ou `DATABASE_URL`) já apontando para um Postgres alcançável com migrations aplicadas; se ausente, falha imediatamente com mensagem clara. Subir/derrubar Postgres é um passo manual e documentado (`src/db/repositories/README.md`), nunca implícito.
- **Isolamento e limpeza**: cada teste cria sua própria `clinic` (com sala/profissional/paciente vinculados) em `beforeEach` e apaga tudo daquela `clinic_id` em `afterEach`, em ordem reversa de FK. Cenários de concorrência não compartilham dados entre si.

## Alternativas consideradas

- **Restringir `SERIALIZABLE` só às operações que envolvem capacidade, deixando `updateSessionStatus` em isolamento padrão** — rejeitada: deixaria a corrida de status descrita no Contexto sem proteção nenhuma, um dado inconsistente e silencioso, exatamente o tipo de falha que o ADR-0010 (auditoria) existe para tornar impossível de esconder.
- **Backoff exponencial** — rejeitada por ora: complexidade desproporcional ao volume real de concorrência da clínica-piloto (4 profissionais). Backoff curto e linear com jitter já evita martelar o banco sem essa complexidade adicional.
- **Testes de integração com container gerenciado automaticamente pelo próprio script de teste** — rejeitada: gerenciar Docker silenciosamente dentro do código de teste tira do desenvolvedor/CI o controle sobre o que está rodando em sua máquina; a decisão foi manter isso explícito e documentado.

## Consequências

- `updateSessionStatus` e as operações de capacidade compartilham a mesma infraestrutura (`withSerializableRetry`, `src/db/transaction-retry.ts`) — um único lugar concentra a política de retry para todo o módulo `scheduling`, e qualquer repositório futuro (billing, records, insurance) que precise da mesma disciplina reaproveita sem duplicar.
- A máquina de estados pura (`session-state-machine.ts`) vive em `modules/scheduling`, mas é importada pelo repositório em `db/repositories/` — uma dependência de mão única (repositório depende de função pura de domínio, nunca o contrário), necessária porque a validação de transição precisa acontecer dentro da transação para ser à prova de corrida.
- Verificar CI/pipeline: `npm run test` nunca deve exigir Postgres; `npm run test:integration` sempre exige provisionamento manual — qualquer automação de CI que rode o segundo precisa explicitamente subir e derrubar o banco como um passo visível do pipeline, não escondido em um hook de teste.
- Risco documentado, não resolvido aqui: a contagem de sobreposição em `countActiveOverlappingSessions` não distingue profissionais — `capacity` limita sessões simultâneas na sala, não "um profissional com até N pacientes". Fica registrado como ambiguidade a resolver junto da pendência do PRD §9 sobre Pilates individual/grupo.
