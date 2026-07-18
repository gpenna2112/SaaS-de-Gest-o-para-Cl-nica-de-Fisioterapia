# ADR-0017 — Módulo `auth`: escopo do Better Auth, provisionamento, autorização por rota, sem FK para `user`

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O ADR-0006 decidiu usar Better Auth (self-hosted, e-mail/senha, isolado atrás de interface própria), mas não detalhou como ele se encaixa no que já foi construído: `professionals` (com `clinicId`, `role`, `active`, `authUserId` nullable sem FK) já é referenciada por `scheduling`, `notifications` e `patients` via `Actor { type, professionalId }`. Este ADR fecha as decisões necessárias para implementar o módulo `auth` de fato, sem contradizer nada do que já existe.

## Decisão

### 1. Better Auth só como identidade — sem o plugin de Organizations

Better Auth tem um plugin de "Organizations" (organization + member + role) que mapearia para clínica/profissional. Não é usado. `professionals` continua a única fonte de verdade para `clinicId`, `role` e `active` — já testada, já referenciada em todo o domínio. Usar o plugin criaria duas fontes de verdade (a `member.role` do Better Auth e a nossa `professionals.role`) e obrigaria o resto do código a conhecer o modelo de organizações da lib, quebrando o isolamento que a ADR-0006 já exige.

### 2. Provisionamento sem convite por token

`professionals` pode existir sem `authUserId` (gestora cadastra nome/e-mail/papel antes da pessoa nunca ter logado — já é assim hoje). No primeiro login: o módulo `auth` verifica se existe uma `professionals` row com aquele e-mail e `authUserId` nulo; se sim, vincula (`authUserId = user.id` recém-criado); se não há correspondência, o cadastro é recusado. Profissionais não se auto-cadastram — só ativam uma conta já pré-provisionada. Sem token de convite, sem e-mail transacional — simplificação deliberada para uma clínica de 4 pessoas.

### 3. Autorização por papel é responsabilidade da camada de rota

`Actor` (já usado em todo repositório) continua carregando só *quem fez* (para auditoria) — sem campo de papel. *Se essa pessoa podia fazer* é checado uma vez, no início da rota (`src/app/api/v1/.../route.ts`), via um helper puro (`hasRole(sessionUser, papeisPermitidos)`), antes de delegar ao serviço/repositório. Reafirma a decisão já tomada na modelagem original: `role` controla acesso a telas/ações, nunca restringe quem pode ser `professional_id` de uma sessão — nada nos repositórios já implementados muda.

### 4. Sem FK entre `professionals.auth_user_id` e `user.id` do Better Auth — com gatilho de revisão

Avaliados quatro eixos:

- **Integridade referencial**: o único código que escreve `auth_user_id` é o próprio módulo `auth`, alimentado diretamente pelo valor que o Better Auth acabou de retornar na mesma operação (decisão 2) — não há caminho de entrada de dado externo/arbitrário que uma FK precisaria proteger. O principal benefício prático de uma FK (`ON DELETE SET NULL` ao excluir um `user`) resolve um cenário que não corresponde a como desativamos profissionais no nosso modelo (usamos `professionals.active = false`, já construído e testado em todo o domínio) — excluir a linha `user` do Better Auth não é o caminho operacional usado para "essa pessoa não trabalha mais aqui".
- **Migrações**: hoje os dois sistemas de migração (Drizzle e Better Auth) são independentes — rodam em qualquer ordem. Uma FK exigiria que a migração do Better Auth rodasse antes da nossa que cria a constraint, introduzindo uma ordem obrigatória nova que não existe hoje e que precisaria ser documentada e lembrada em todo ambiente novo (dev, CI, staging).
- **Manutenção e atualizações da biblioteca**: o Better Auth é jovem (risco já registrado na ADR-0006 — "API ainda em evolução"). O formato de `user.id` é decidido e versionado pela própria lib. Uma FK é um compromisso estrutural com a forma interna de uma tabela que não controlamos; uma mudança de formato de ID em uma atualização futura quebraria a constraint imediatamente. Sem FK, essa mudança fica invisível ao nosso schema — só a lógica de comparação em `getSessionUser()` (código, não schema) precisaria, na pior hipótese, de ajuste. Reconhecido o contra-argumento: essa carga se concentra no momento de upgrade do Better Auth, que já é deliberado e cuidadoso (ADR-0006, mitigação 1) — não é uma dívida desproporcional, mas é uma dívida a mais.
- **Precedente da indústria**: o padrão "FK direta para a tabela de usuários do provedor de auth" é recomendado em sistemas maduros (ex. Supabase: `profiles.id REFERENCES auth.users(id)`). A diferença: o `auth.users` do Supabase é um contrato estável e documentado que o provedor garante não quebrar entre atualizações do serviço gerenciado. O Better Auth, self-hosted e jovem, ainda não estabeleceu essa garantia — copiar o padrão de um sistema maduro sem essa garantia não é uma comparação justa.

**Gatilho de revisão explícito** (mesmo espírito do RLS na ADR-0007 — não "nunca", "ainda não"): revisitar quando o Better Auth atingir uma versão que se considere estável o suficiente para confiar no contrato de `user.id`, **ou** se surgir um incidente real de referência órfã em produção — o que vier primeiro.

Adicionado, sim: **`UNIQUE(auth_user_id) WHERE auth_user_id IS NOT NULL`** (índice único parcial) — impede uma mesma identidade Better Auth virar duas `professionals` distintas. Assume 1 pessoa = 1 clínica no MVP; revisitar se um dia alguém trabalhar em múltiplas clínicas.

### 5. Proteção de rota: guarda explícita por rota como autoridade

Um helper (`requireSession()`/`requireRole()`) chamado no topo de cada route handler faz a checagem completa — inclusive `professionals.active`, que exige consulta ao banco e por isso não pode viver só num middleware de Edge com runtime restrito. Um `middleware.ts` do Next.js em runtime Node pode ser adicionado depois como camada de rejeição rápida por presença de cookie, mas nunca substitui a checagem completa na rota — é otimização, não garantia.

**Fora deste módulo, sinalizado para não ser esquecido:** o futuro webhook de resposta do WhatsApp (`notifications`) não usa sessão de paciente (PRD: pacientes não têm login no MVP) — sua autenticação é verificação de assinatura do provedor (Meta), mecanismo diferente. `getSessionUser()` não protege aquela rota.

## Alternativas consideradas

- **Plugin de Organizations do Better Auth** (decisão 1) — rejeitado: duas fontes de verdade para clínica/papel, quebra o isolamento da ADR-0006.
- **Convite por token no primeiro acesso** (decisão 2) — rejeitado para o MVP: complexidade (token, e-mail transacional) desproporcional a uma clínica de 4 pessoas; revisitar se o produto crescer além de clínicas pequenas.
- **`Actor` carregando `role` para checagem nos repositórios** (decisão 3) — rejeitado: misturaria autorização (HTTP/acesso) com auditoria (quem fez), duas responsabilidades distintas; autorização já é resolvida uma vez na borda.
- **FK com `ON DELETE SET NULL`** (decisão 4) — considerada com seriedade (é o padrão recomendado por sistemas maduros como Supabase), rejeitada pelos motivos detalhados acima, com gatilho de revisão explícito, não descartada permanentemente.
- **Importar o schema Drizzle gerado pelo Better Auth para o nosso `schema/`, unificando os dois sistemas de migração** (decisão 4) — trocaria acoplamento de ordem de migração por acoplamento de geração de código; toda atualização do Better Auth poderia exigir regenerar/rediffar uma parte do schema que não desenhamos. Mesmo tipo de risco, superfície diferente; não resolve o problema, só o move.
- **Middleware do Next.js como única linha de defesa** (decisão 5) — rejeitado: checagem de `professionals.active` exige banco, inadequado para rodar isoladamente em runtime de borda restrito.

## Consequências

- `professionals.auth_user_id` permanece `text`, nullable, sem FK — só ganha um índice único parcial (nova migração incremental).
- `getSessionUser()` é o único ponto, além da rota catch-all do Better Auth, autorizado a importar a lib diretamente — reforça o isolamento já exigido pela ADR-0006.
- Toda rota protegida precisa checar sessão **e** `professionals.active` a cada requisição, não só no login — sessão dura ~60 dias; sem essa checagem viva, um profissional desativado manteria acesso até a sessão expirar. Fica registrado como requisito, não como detalhe de implementação.
- Dois sistemas de migração continuam independentes (nenhuma ordem obrigatória entre eles) — trade-off aceito em troca de não acoplar nosso schema à forma interna de uma tabela que não controlamos.
- Revogação de sessão antes da expiração (ex.: fisio perde o celular) fica como pendência de decisão de produto, não resolvida por este ADR.
