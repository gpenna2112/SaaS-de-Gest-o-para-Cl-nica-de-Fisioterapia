# ADR-0011 — Backup: dump externo diário + teste de restore

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O sistema substitui o caderno de 4 profissionais; perder o banco é o fim do produto (o risco nº 1 é adoção — não há segunda chance com a clínica-piloto). Backups default do PaaS (ADR-0008) são diários, com retenção curta, e moram **no mesmo provedor** da produção. "O PaaS faz backup" é esperança, não estratégia — omissão identificada na revisão crítica.

## Decisão

1. **Dump noturno automatizado** (`pg_dump`) para object storage **fora do provedor de produção** (Cloudflare R2 ou S3), retenção de 30 dias. Custo: centavos/mês.
2. **Teste de restauração real** em ciclo mensal/trimestral: restore num banco vazio + verificação. Backup não testado não existe.
3. **RPO/RTO declarados e honestos para o estágio:** perda máxima tolerada de 24h; restauração em poucas horas, com procedimento documentado.

## Alternativas consideradas

- **Somente backups do PaaS** — ponto único de falha no provedor; retenção e restore limitados.
- **PITR (point-in-time recovery, perda ~zero)** — desejável, mas exige Postgres gerenciado com PITR nativo (Neon, Crunchy etc.); registrado como upgrade quando houver múltiplas clínicas pagantes — a migração é troca de connection string, não de arquitetura.
- **Replicação contínua própria (wal-g etc.)** — nós viramos ops; contradiz o ADR-0008.

## Consequências

- Cópia dos dados sobrevive à falha (ou ao encerramento) do provedor de produção.
- O teste periódico de restore é compromisso operacional recorrente — entra no calendário, não na boa intenção.
- Gatilho de revisão explícito: múltiplas clínicas pagantes ⇒ reavaliar RPO e adotar PITR.
