# patients

Cadastro de pacientes: identidade estável (UUID público, ADR-0004), vínculo com a fisioterapeuta responsável.

É a fundação referenciada pelo prontuário (fase 3) e por integrações externas (app de avaliação de pés, PRD §7.1) — por isso a identidade do paciente não pode ser um id sequencial interno.

**Limites:** não importa nada de `src/app`. Não conhece regras de agendamento (é `scheduling` que referencia `patient_id`, não o contrário).

**Status:** vazio. Sem código ainda. Ver `docs/prd.md` §5 (F3) e ADR-0004.
