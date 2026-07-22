# Documentação — clinic-management

Índice curto. Cada pasta cobre um domínio; nenhuma pasta duplica o conteúdo de outra.

## Produto
- [`produto/prd.md`](produto/prd.md) — requisitos, perfis de usuário, escopo do MVP, roadmap das fases 2–5, riscos.

## Frontend
- [`frontend/design-system.md`](frontend/design-system.md) — identidade visual da marca, paleta acessível derivada, tokens de tema.
- [`frontend/regras-de-interface.md`](frontend/regras-de-interface.md) — regras gerais de UX, formulários, tabelas, diálogos e acessibilidade.

## Infraestrutura
- [`infraestrutura/ambiente-local.md`](infraestrutura/ambiente-local.md) — setup do ambiente de desenvolvimento local (Postgres via Docker, scripts automatizados, solução de problemas).

## Arquitetura e decisões (ADRs)
- [`arquitetura/visao-geral.md`](arquitetura/visao-geral.md) — arquitetura consolidada: módulos, stack, estrutura de repositório, regras transversais.
- [`arquitetura/adrs/`](arquitetura/adrs/) — uma decisão arquitetural por arquivo, numeradas sequencialmente (`README.md` da pasta tem o índice com status de cada uma).

## Ferramentas de desenvolvimento
- [`development/MCP_GUIDE.md`](development/MCP_GUIDE.md) — qual servidor MCP usar em cada tipo de tarefa.

## Documentação técnica ao lado do código

Schema de banco, repositórios e módulos de domínio são documentados em `README.md` própios, ao lado do código que descrevem — não centralizados aqui, para quem está editando aquele código encontrar o contexto sem sair da pasta:

- `src/db/README.md` — decisões que moldam o schema Drizzle.
- `src/db/repositories/README.md` — padrões de repositório e como rodar os testes de integração.
- `src/jobs/README.md` — por que o worker pg-boss ainda não foi implementado.
- `src/modules/auth/README.md`, `src/modules/scheduling/README.md`, `src/modules/patients/README.md`, `src/modules/notifications/README.md`, `src/modules/evolutions/README.md` — um por módulo de domínio.

## Fora deste índice
- `README.md` (raiz) — onboarding geral, stack aprovada, scripts npm.
- `CLAUDE.md` (raiz) — guia operacional para agentes de IA trabalhando neste repositório.
