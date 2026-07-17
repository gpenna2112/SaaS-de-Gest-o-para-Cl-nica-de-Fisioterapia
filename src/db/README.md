# db

PostgreSQL + Drizzle (ADR-0002, ADR-0003). Vai conter o schema, migrações SQL (incluindo a exclusion constraint de conflito de sala) e repositórios tenant-scoped (ADR-0007).

**Status:** deliberadamente vazio nesta etapa de scaffolding. Nenhum arquivo (`client.ts`, schema) foi criado porque nada no projeto ainda consome uma conexão de banco — criar esse arquivo agora seria infraestrutura sem uso concreto. Ele entra na próxima tarefa, junto com o desenho do schema, e só depois das três decisões pendentes (modelo de `role`, remarcação in-place vs. nova linha, capacidade de sala) — todas afetam o schema diretamente.

Dependências (`drizzle-orm`, `postgres`) também não foram instaladas por esse motivo; entram junto com o schema.
