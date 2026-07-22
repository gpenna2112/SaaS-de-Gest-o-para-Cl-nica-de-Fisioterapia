# ADR-0018 — Design system: manter componentes próprios; shadcn/ui só sob demanda, de forma híbrida

- **Status:** Aceito
- **Data:** 2026-07-20

> **Nota de atualização (2026-07-21):** o gatilho previsto em "Quando revisitar" ocorreu — surgiu a primeira necessidade real de confirmação de ações destrutivas (cancelar sessão, desativar paciente/profissional/sala), exatamente o cenário de `Dialog` cogitado na Decisão final. O componente foi introduzido **vendorizado à mão** (`src/components/ui/dialog.tsx` + `confirm-dialog.tsx`), não via `npx shadcn add dialog`: o dry-run do CLI confirmou que ele sobrescreveria `button.tsx` com variants incompatíveis (`default/outline/ghost/destructive` no lugar de `primary/secondary/danger`), reproduzindo o mesmo incidente já registrado no Contexto deste ADR. A decisão híbrida em si **não muda** — os componentes nativos continuam como estão, e o novo `Dialog` usa só tokens já existentes (`--color-background/foreground/border/muted/ring`), sem reconciliar tokens do preset shadcn que não chegaram a ser necessários. Ver `docs/frontend/regras-de-interface.md` para a nota equivalente do lado de regras de UI.

## Contexto

`src/components/ui/` tem 6 componentes (`Button`, `Card`, `Input`, `Select`, `StatusBadge`, `LinkButton`), ~140 linhas no total: funções simples sobre elementos HTML nativos (`button`, `input`, `select`, `fieldset`/`legend`/`label`, `checkbox`), `className` via template string, sem `cva`, sem `cn()`, sem lib headless. Tema em `globals.css` via `@theme` do Tailwind v4, com paleta própria (`--color-primary` teal `#0f766e`). Nenhuma tela do MVP usa overlay (`Dialog`, `Popover`, `Combobox`, `Dropdown`, `Tooltip`, `Toast`) — inclusive `patient-multiselect.tsx`, que hoje é uma lista de checkboxes, não um combobox.

Um experimento com `npx shadcn@latest init` (não commitado) expôs um risco concreto: o CLI sobrescreveu `button.tsx` sem aviso, quebrando a API consumida por `link-button.tsx` (`buttonClassName`/`ButtonVariant`), e substituiu a paleta teal por tokens oklch cinza-neutro genéricos em `globals.css`, exigindo revert manual. O roadmap pós-MVP (PRD §6, fases 2–3: financeiro, prontuário digital) deve trazer necessidades de UI que HTML nativo cobre mal — tabelas com filtro, confirmações modais, busca de paciente, feedback assíncrono.

## Problema

Decidir entre manter os componentes próprios, migrar integralmente para shadcn/ui, ou adotar as duas coisas de forma híbrida — equilibrando a simplicidade real de hoje (zero widgets complexos) com a complexidade que o roadmap já sinaliza, e respeitando o princípio do projeto de evitar dependências e complexidade desnecessárias.

## Opções consideradas

1. **Manter componentes próprios** — status quo; qualquer necessidade nova (Dialog, Combobox etc.) seria implementada à mão, sobre HTML/ARIA manual.
2. **Migrar completamente para shadcn/ui** — reescrever os 6 componentes existentes sobre a lib headless do preset (`@base-ui/react`) e reconciliar todo o tema agora, mesmo sem uso imediato dos widgets que justificam a lib.
3. **Abordagem híbrida** — manter os componentes nativos onde já resolvem bem; usar shadcn/ui apenas para os widgets que HTML nativo não cobre, introduzidos quando a necessidade aparecer de fato.

## Critérios de decisão

| Critério | Manter próprios | Migrar 100% | Híbrida |
|---|---|---|---|
| Arquitetura | Zero deps de UI, alinhado a "evitar complexidade desnecessária" | Introduz `@base-ui/react` + `cva` como camada permanente para um app sem widgets que precisem disso hoje | Lib headless só onde HTML nativo não cobre (overlays) |
| Manutenção | Baixa, 100% interna, superfície pequena | `shadcn add` sobrescreve arquivos existentes sem perguntar (confirmado na prática); CLI ainda mudando de formato (presets, v4.x recente) | Dividida mas isolada: poucos componentes vendorizados e auditáveis, resto trivial |
| Acessibilidade | Já boa hoje — HTML nativo dá foco/teclado/leitor de tela de graça | Ganho real só aparece em overlays, que o projeto ainda não tem | Ganho exatamente onde importa (overlays), sem custo onde não importa |
| Customização | Total, zero fricção, paleta própria é first-class | Preset vem com paleta/tokens próprios que conflitam com os atuais (foi o que trocou teal por cinza no teste) | Total nos dois mundos, mas exige reconciliar tokens shadcn com a paleta atual antes do 1º componente |
| Consistência visual | Alta hoje, fácil de auditar (poucas telas) | Ganho marginal num app deste tamanho; risco real de regressão durante a migração | Risco de fragmentação sem regra clara de "quando usar o quê" |
| Custo de migração | Zero agora | Alto para o ganho: reescrever 6 componentes + reconciliar tema + auditar todas as telas, por acessibilidade e consistência que já existem | Baixo e incremental — só paga quando a necessidade aparece |

## Decisão final

**Híbrida, com regra explícita — não migração ampla nem adoção preventiva.**

- Os 6 componentes nativos atuais (`Button`, `Card`, `Input`, `Select`, `StatusBadge`, `LinkButton`) permanecem como estão. Não há problema a resolver ali.
- shadcn/ui fica reservado para widgets que o MVP ainda não tem e HTML nativo não cobre bem, introduzidos apenas quando a necessidade for real (ex.: `Dialog` para confirmação de cancelamento, `Combobox` para busca de paciente quando a lista de checkboxes não escalar mais, `Toast` para feedback de notificação, date picker na agenda).
- Antes de instalar o primeiro componente shadcn de fato: reconciliar os tokens de tema (`--primary`, `--background` etc.) com a paleta atual, em vez de aceitar o default do preset. Nunca rodar `shadcn add`/`init` sobre um arquivo já existente sem revisar o diff antes — o incidente do `button.tsx` mostrou que o CLI sobrescreve sem confirmação.

## Consequências positivas

- Nenhuma reescrita/regressão visual imediata; superfície de manutenção continua pequena até que a complexidade real apareça.
- Quando `Dialog`/`Combobox`/`Toast` forem necessários (fases 2–3), o projeto ganha acessibilidade testada (focus trap, ARIA) em vez de reimplementação manual de overlay.
- Custo de setup de tema shadcn é pago uma única vez, no momento em que for de fato consumido — não antecipado.

## Trade-offs

- Dois padrões de componente coexistirão no repo assim que o primeiro widget shadcn for adicionado (nativo simples vs. vendorizado com `cva`/`cn()`) — exige disciplina para não fragmentar o design system além do necessário.
- A reconciliação de tokens de tema fica adiada, não resolvida agora — quem instalar o primeiro componente shadcn precisa lembrar de fazer esse trabalho, em vez de herdar um tema já pronto.
- `components.json`, `src/lib/utils.ts` e as dependências do toolchain shadcn (`@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `tailwind-merge`, `tw-animate-css`, `shadcn` como devDependency) já existem no repo (não commitados) sem nenhum componente real os consumindo ainda — ficam como scaffolding à espera do primeiro uso real.

## Quando revisitar

Quando surgir a primeira necessidade real de um widget que HTML nativo não cobre bem — provavelmente na fase 2 (financeiro: tabelas com filtro, confirmações) ou fase 3 (prontuário: formulários mais ricos, histórico pesquisável) do roadmap (PRD §6) — ou se a lista de componentes nativos crescer a ponto de duplicar lógica que uma lib já resolve. Revisitar também se o próprio shadcn/ui estabilizar o formato do CLI (hoje na v4.x, com presets recém-introduzidos) a ponto de o risco de sobrescrita deixar de ser uma preocupação prática.
