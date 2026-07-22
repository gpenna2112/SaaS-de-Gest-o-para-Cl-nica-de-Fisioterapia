# PRD — SaaS de Gestão para Clínicas de Fisioterapia

> **Status:** Draft v1.0 · **Data:** 2026-07-17
> **Origem:** Descoberta estruturada conduzida com clínica-piloto real (porte médio, 4 fisioterapeutas)

---

## 1. Visão

Substituir o caderno de papel e o WhatsApp como sistema operacional de clínicas de fisioterapia de pequeno e médio porte que operam **sem recepcionista**, começando pela agenda unificada e evoluindo para financeiro, prontuário e convênios.

**Princípio norteador:** o sistema só será adotado se cada interação for **mais rápida que o papel**. O maior risco do produto não é técnico — é adoção por profissionais habituadas a papel e WhatsApp.

---

## 2. Contexto: a clínica-piloto

| Dimensão | Realidade observada |
|---|---|
| Equipe | 4 fisioterapeutas: Angélica (dona), Patricia (administrativo), Fernanda e Sophia |
| Estrutura física | 2 salas individuais + 1 sala de Pilates = **3 espaços simultâneos** |
| Sessões | 50 minutos, marcadas **sessão a sessão** (sem horário fixo) |
| Recepção | Não existe. Cada fisio gerencia a própria agenda |
| Ferramentas atuais | Papel, WhatsApp e apps de notas. Nunca usaram software de gestão |
| Agendamento | Paciente marca por WhatsApp direto com a fisio; conflitos de sala resolvidos na conversa |
| Confirmação | Mensagem manual no dia da sessão |
| Faltas | Sessão não avisada é **cobrada** |
| Pagamentos | Pix e dinheiro (sem cartão). Cada fisio controla o próprio caixa |
| Pilates | Mensalidade |
| Convênios | Apenas Sophia atende (Cassi, Saúde Caixa, SulAmérica) — guias com 10 sessões |
| Modelo financeiro | Angélica e Patricia: 100% da produção. Fernanda e Sophia: repasse de 50% para a clínica. Angélica controla a produção das duas |
| Registro clínico | Anotações por paciente em papel, WhatsApp e notas — histórico não encontrável |
| Alta | Formalizada. Particular sem número previsto de sessões; convênio com 10 por guia |

**Insight estrutural:** a clínica opera como um coletivo de profissionais autônomos. A **sala é o recurso escasso** (4 fisios ÷ 3 espaços), não o profissional. O motor de agendamento deve tratar o espaço como recurso de primeira classe.

---

## 3. Perfis de usuário

### 3.1 Fisioterapeuta (todas)
- Gerencia a própria agenda e os próprios pacientes.
- Usa o **celular entre sessões** — interações de no máximo 30 segundos.
- Precisa: ver agenda do dia, marcar/remarcar, registrar presença/falta, anotar evolução.

### 3.2 Gestora financeira (Angélica)
- Precisa enxergar a **produção por fisioterapeuta** para calcular o repasse de 50% (Fernanda e Sophia).
- Hoje esse controle depende de papel e confiança.
- Usa desktop.

### 3.3 Administradora (Patricia)
- Cuida de documentação, contador e burocracia da clínica.
- Precisa de relatórios e exportações. Usa desktop.

### 3.4 Paciente (indireto no MVP)
- Não tem login no MVP. Interage via WhatsApp (confirmação de sessão).
- Futuro: agendamento self-service e acesso a relatórios.

> **Não existe perfil "recepcionista".** O sistema não pode assumir alguém dedicado à operação da agenda.

---

## 4. Dores priorizadas

Priorização feita com a clínica ("todas são dores" → forçada escolha única):

1. **🥇 Agenda unificada** — conflito de salas, marcação dispersa em 4 agendas de papel, confirmação manual.
2. Controle financeiro — quem pagou, quem deve, produção por fisio, mensalidades.
3. Prontuário digital — histórico espalhado e não encontrável.
4. Convênio/guias — controle das 10 sessões, faturamento (detalhes pendentes de descoberta).

---

## 5. MVP — "A agenda que substitui o caderno"

### Escopo

**F1. Agenda unificada com salas como recurso**
- Visão única das 4 fisioterapeutas e dos 3 espaços.
- Impossível agendar duas fisios na mesma sala no mesmo horário (conflito bloqueado na origem).
- Slots de 50 minutos como padrão configurável.
- Marcação sessão a sessão (sem exigir recorrência).

**F2. Confirmação automática via WhatsApp**
- Mensagem automática ao paciente no dia da sessão (substitui o processo manual atual).
- Resposta do paciente atualiza o status (confirmado / cancelado).
- Falta sem aviso registrada → gera pendência de cobrança (falta é cobrada).

**F3. Cadastro de pacientes**
- Cadastro simples vinculado à fisioterapeuta responsável e às sessões.
- Identidade estável do paciente — é a fundação do prontuário (fase 2) e das integrações externas (§7).

**F4. Registro de sessão realizada**
- Um toque: realizada / falta / cancelada.
- Sessão realizada = unidade de produção → alimenta o financeiro da fase 2 sem digitação extra.

### Requisitos de experiência
- **Mobile-first** para as fisioterapeutas (agenda, confirmações, status de sessão).
- **Desktop** para Patricia e Angélica (visão gerencial, relatórios).
- Toda ação frequente em ≤ 30 segundos e ≤ 3 toques.

### Fora do MVP (explicitamente)
- Pagamentos e cobranças dentro do sistema.
- Prontuário digital completo (avaliação inicial, tipos de documento plugáveis, estados `rascunho → revisado → finalizado`) — ver nota de reprioritização abaixo para o que *entrou* no MVP.
- Convênios, guias e TISS.
- Login de paciente / agendamento self-service.
- Mensalidades do Pilates.

> **Nota de reprioritização (2026-07-21):** uma versão *mínima* de evolução clínica (registro de texto livre por atendimento realizado + histórico cronológico por paciente) foi trazida para o MVP, contradizendo o texto original desta seção — decisão registrada e justificada no [ADR-0019](../arquitetura/adrs/0019-evolucao-clinica-minima.md). O prontuário *completo* da fase 3 (§6) continua fora do MVP: sem tipos de documento plugáveis, sem máquina de estados, sem integração com o app de avaliação de pés.

---

## 6. Roadmap pós-MVP

| Fase | Entrega | Justificativa |
|---|---|---|
| 2 | **Financeiro**: produção por fisio, repasse de 50%, controle de pagamentos (Pix/dinheiro), pendências de faltas | Dor direta da Angélica; dados já nascem da agenda (sessão realizada = produção) |
| 3 | **Prontuário digital**: avaliação inicial, evolução por sessão, histórico pesquisável, alta formalizada | Registro precisa ser mais rápido que o papel; estrutura de documentos com estados (rascunho → revisado → finalizado) |
| 4 | **Mensalidades do Pilates** | Modelo de cobrança recorrente distinto da sessão avulsa |
| 5 | **Convênios**: contagem de sessões por guia (10), presenças, faturamento TISS | Complexo; atende 1 de 4 fisios; descoberta pendente |

**Lógica do sequenciamento:** a agenda é o único ponto por onde as quatro fisioterapeutas passam todos os dias — é ela que cria o hábito. Financeiro e prontuário tornam-se subprodutos naturais de uma agenda utilizada.

---

## 7. Integrações e arquitetura aberta

### 7.1 App de avaliação de pés (projeto irmão)

Existe um protótipo separado de avaliação manual/visual dos pés com geração de relatório revisável (com regras próprias de segurança clínica: revisão humana obrigatória, sem diagnóstico automático).

**Decisões de integração:**
- **Assíncrona, via API** — sem acoplamento em tempo real com a agenda.
- O app permanece um projeto separado; quando maduro, envia o relatório finalizado para o prontuário do paciente no SaaS (endpoint "anexar documento clínico").
- O paciente é a **entidade compartilhada**: o cadastro (F3) deve ter identidade estável referenciável por sistemas externos.

### 7.2 Diretrizes de arquitetura decorrentes
- API-first: o prontuário (fase 3) nasce com suporte a **tipos de avaliação plugáveis** e anexos de documentos externos.
- Modelo de estados para documentos clínicos: `rascunho → revisado → finalizado` — alinhado às regras do app de pés e à segurança clínica em geral.
- Nada disso altera o escopo do MVP; apenas impede que ele seja construído fechado.

---

## 8. Indicadores de gestão (visão inicial)

- Taxa de ocupação por espaço e por fisioterapeuta.
- Sessões realizadas × faltas × cancelamentos.
- Produção por fisioterapeuta (base do repasse).
- Taxa de confirmação via WhatsApp.
- (Fase 3+) Pacientes ativos, altas, pacientes inativos sem retorno.

---

## 9. Pendências de descoberta

- [ ] Detalhamento do fluxo de convênio (Sophia): autorização de guias, registro de presença/assinatura, envio do faturamento, prazos de pagamento, glosas.
- [ ] Reativação de pacientes que abandonaram o tratamento — existe processo hoje? Há interesse?
- [ ] Volume: pacientes/dia e por fisioterapeuta (não levantado).
- [ ] Pilates: individual ou em grupo? Capacidade por horário?
- [ ] Precificação do SaaS e modelo de cobrança (por clínica? por profissional?).

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| **Adoção** — equipe nunca usou software; hábito de papel/WhatsApp | Toda interação mais rápida que o papel; mobile-first; MVP mínimo focado na agenda |
| Dependência do WhatsApp para confirmações (API oficial tem custo/burocracia) | Avaliar WhatsApp Business API vs. alternativas; fallback manual |
| Escopo inflado ("todas são dores") | Roadmap sequenciado; fases só avançam com a anterior adotada |
| Convênio subestimado (TISS é complexo) | Isolado na fase 5, com descoberta dedicada antes |
