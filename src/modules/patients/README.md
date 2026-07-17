# patients

Cadastro de pacientes: identidade estável (UUID público, ADR-0004), vínculo com a fisioterapeuta responsável.

É a fundação referenciada pelo prontuário (fase 3) e por integrações externas (app de avaliação de pés, PRD §7.1) — por isso a identidade do paciente não pode ser um id sequencial interno. `scheduling` e `notifications` já leem `patients` diretamente (existência/telefone); este módulo formaliza essas regras, não cria uma dependência nova.

**Código implementado:**
- `phone.ts` — pura: `normalizePhone`/`isValidPhone`. Normaliza formatos comuns de telefone brasileiro para E.164 (`+55DDNNNNNNNNN`); não é um validador completo de telefonia.

O repositório está em `src/db/repositories/patients-repository.ts`: `createPatient`, `getPatient`, `listPatients`, `updatePatient`, `deactivatePatient`. Nenhuma operação precisa de `SERIALIZABLE` (sem contagem entre linhas concorrentes) — só atomicidade simples entre a escrita em `patients` e o registro em `audit_log`.

## Decisões de produto

- **Sem unicidade de telefone.** Duas pessoas podem legitimamente compartilhar um número (ex. responsável por menor de idade). Sem detecção de duplicata por nome/telefone — "cadastro simples" (PRD F3), fora de escopo do MVP.
- **`createPatient`/`updatePatient`/`deactivatePatient` geram entrada em `audit_log`** (`entity_type = 'patient'`), mesmo padrão de `scheduling`/`notifications` (ADR-0010). Leituras (`getPatient`/`listPatients`) não.
- **`primaryProfessionalId` deve referenciar um profissional existente e ativo** — `ProfessionalNotFoundError`/`ProfessionalInactiveError` caso contrário.
- **`deactivatePatient` é idempotente** (desativar quem já está inativo não gera novo registro de auditoria) e **não tem efeito cascata**: não cancela sessões futuras, não mexe em notificações pendentes. O único efeito fora deste módulo é em `scheduling`: `createSession`/`addAttendee` passam a rejeitar `patientIds` de pacientes inativos com `PatientInactiveError` — **desativar impede novos agendamentos, não desfaz os existentes.** Tratamento de sessões futuras de um paciente desativado (cancelar? avisar?) fica para uma camada de serviço ou fluxo explícito futuro — decisão deliberada, não esquecimento.

**Limites:** não importa nada de `src/app`. Não conhece regras de agendamento (é `scheduling` que referencia `patients`, e agora também valida `active`, não o contrário).
