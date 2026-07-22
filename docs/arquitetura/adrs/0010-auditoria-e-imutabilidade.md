# ADR-0010 — Auditoria via `audit_log` e imutabilidade de sessões

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

A clínica é um coletivo de profissionais autônomas disputando 3 salas, onde **falta gera cobrança**. "Quem remarcou minha sessão?", "quem registrou essa falta?" são conflitos humanos e financeiros previsíveis. Sem trilha, o sistema perde a confiança — e confiança é o requisito de adoção. Na fase 3 (prontuário), auditoria vira exigência legal, não só operacional. Neste domínio, **auditoria é feature, não infraestrutura** — omissão identificada na revisão crítica.

## Decisão

1. **Tabela `audit_log`**: ator, ação, entidade, `clinic_id`, timestamp, estado antes/depois em JSONB. Escrita pela **camada de serviço** em toda mutação de agendamento e de status de sessão — como toda mutação passa pelos módulos de domínio, é um ponto único.
2. **Sessões nunca são deletadas.** Cancelamento e remarcação são transições de estado; a cadeia de mudanças é preservada e cada transição registra o ator.

## Alternativas consideradas

- **Event sourcing completo** — a agenda como log de eventos é elegante, mas inverte a arquitetura inteira por um benefício que uma tabela entrega.
- **Triggers de banco** — capturam tudo, inclusive acesso fora da aplicação, mas não sabem *quem* foi: o ator é informação da aplicação. Poderiam complementar no futuro; não substituem.
- **Não auditar no MVP** — barato hoje, mas retrofitar auditoria exige reconstituir histórico que já se perdeu; e o custo presente é uma tabela + uma chamada por mutação.

## Consequências

- Disputas de agenda e de cobrança de falta têm resposta objetiva — sustenta a confiança no sistema.
- A fase 3 herda o mecanismo pronto onde ele será exigência legal.
- Volume de `audit_log` cresce sem limite — irrelevante na escala atual; particionar/arquivar é problema futuro conhecido.
