# scheduling

Agenda, sessões, salas/espaços e as transições de status (`agendada → confirmada → realizada/falta/cancelada`).

Contém a regra mais crítica do produto: impossível agendar duas fisioterapeutas na mesma sala no mesmo horário. Essa garantia é do banco (exclusion constraint, ADR-0002), não deste módulo — o módulo é responsável por orquestrar a operação e validar antes de tentar persistir, para dar feedback amigável.

**Limites:** não importa nada de `src/app` (Next.js). Não conhece o provedor de notificação (chama `notifications` através de sua interface pública). Não conhece detalhes de auth além de receber o ator já resolvido.

**Status:** vazio. Sem código ainda — aguardando três decisões arquiteturais pendentes (modelo de `role`, remarcação in-place vs. nova linha, capacidade de sala) antes de desenhar entidades e regras. Ver `docs/architecture.md` e ADR-0002, ADR-0007, ADR-0010.
