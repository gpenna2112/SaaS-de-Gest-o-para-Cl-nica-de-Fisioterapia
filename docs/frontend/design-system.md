# Design System — Espaço Fisio

Análise da identidade visual oficial da clínica e proposta de tokens para a UI web. Este documento é só análise e proposta — **nenhum código da aplicação foi alterado**; a adoção dos tokens abaixo é um passo separado, deliberado.

*Revisado em 2026-07-20 como auditoria de arquitetura de design system (consistência de tokens, escalas, tipografia, acessibilidade, estados de componente) — ver [§9 Registro de revisão](#9-registro-de-revisão).*

## 1. Fonte da identidade

Extraída de `Papel-de-carta.docx` (papel timbrado oficial, autor Maria Angélica Ferreira Leal Puppin, empresa "Espaço Fisio" nos metadados do arquivo). O documento não tem texto no corpo — a identidade visual inteira está em duas imagens de cabeçalho, copiadas para referência em [`assets/espaco-fisio-letterhead-01.png`](assets/espaco-fisio-letterhead-01.png) e [`assets/espaco-fisio-letterhead-02.png`](assets/espaco-fisio-letterhead-02.png). As cores abaixo foram extraídas por amostragem de pixel direta dessas imagens (não estimadas visualmente) — os dois arquivos concordam exatamente nos mesmos dois tons.

Não há arquivo vetorial (AI/SVG/EPS) da logo disponível, só o PNG embutido no Word — ver [§8 Próximos passos](#8-próximos-passos).

## 2. Paleta oficial

Duas cores de marca, extraídas com precisão de pixel:

| Papel | Hex | RGB | HSL |
|---|---|---|---|
| **Coral** (usado em metade das letras da wordmark) | `#DE9A99` | `222, 154, 153` | `H 1° S 51% L 74%` |
| **Verde-sálvia / teal** (usado na outra metade da wordmark + todo o texto de contato) | `#87BFB8` | `135, 191, 184` | `H 173° S 30% L 64%` |

**Achado crítico de acessibilidade:** as duas cores, no tom exato da marca, **falham contraste WCAG contra fundo branco** — coral `2.29:1`, teal `2.06:1` (mínimo exigido: `4.5:1` para texto normal, `3:1` para texto grande/componentes de UI). Isso é esperado — são cores de identidade visual pensadas para papel/impressão em traços finos e texto grande, não para texto de interface em telas pequenas. Usá-las diretamente como cor de texto ou botão na UI reproduziria o mesmo problema de legibilidade que a ADR-0018 já identificou como risco a evitar. A escala derivada no §5 resolve isso mantendo o matiz da marca.

## 3. Tipografia

Toda a tipografia do papel timbrado está desenhada como arte (imagem), não como texto vivo — não há nome de fonte a extrair do arquivo. Duas vozes tipográficas distintas, pelo traço:

- **Wordmark ("Espaço Fisio")** — display geométrico, traço fino, bastante tracking (letras bem separadas), formas abertas e não convencionais: o "S" desenhado como parêntese/chave, "C"/"O" como círculos abertos, "A" sem travessão. As palavras **ESPAÇO** e **FISIO** são intercaladas letra a letra (E-F-S-I-P-S-A-I-Ç-O-O), alternando coral e teal a cada letra — os dois "O" finais (de FISIO e ESPAÇO) parecem fundidos num glifo circular maior, quase um monograma. É uma peça decorativa de marca, não um alfabeto utilizável em texto de interface.
- **Bloco de contato (endereço/telefone)** — monoespaçada, técnica, tracking largo, tom teal, todo em minúsculas com abreviações (`Av.`, `t.`). Funciona como voz "de legenda/etiqueta", contrastando com o wordmark decorativo.

Como não há fonte real para herdar, a recomendação (§6.6) é escolher fontes web que ecoem esse caráter sem comprometer legibilidade de produto — a wordmark em si deve continuar existindo só como imagem/SVG de marca, nunca recriada em CSS.

**Estado atual do app (verificado em `src/app/layout.tsx`):** nenhuma fonte customizada carregada hoje — o app usa a pilha `sans-serif` padrão do navegador. A adoção de uma fonte de produto (§7) é, portanto, trabalho novo, não substituição.

## 4. Espaçamento e estilo do layout

Da seção do documento (A4, `210×297mm`): margens fortemente assimétricas — topo `~4,0cm` (respiro generoso acima da wordmark), laterais `~1,5cm`, rodapé `~2,7cm`. Bloco de contato pequeno, alinhado à direita, no canto inferior — o resto da página é vazio.

Elemento gráfico único: uma linha curva fina (S-curva, ~0,75pt, cor coral), descendo verticalmente do topo até a base da página, à esquerda — um traço solto, sem preencher formas, evocando movimento/coluna, coerente com fisioterapia.

**Leitura de estilo:** minimalista, arejado, elegante, tom pastel suave, baixo peso visual — estética "boutique/wellness", não "clínico-hospitalar". Isso está em tensão direta com um requisito real do produto: a agenda (grade por sala/horário) precisa ser densa e escaneável em ≤ 3 toques (CLAUDE.md, PRD). A aplicação em §6 usa o espaço generoso onde a marca aparece (login, estados vazios, telas de baixa densidade) e mantém a agenda compacta, emprestando só cor e forma da marca ali, não o espaçamento.

## 5. Escala acessível derivada

Mesmo matiz e saturação da marca, variando luminosidade, para cobrir texto/estado/interação sem perder a identidade. Gerada e validada por contraste (WCAG) — não estimada visualmente.

**Convenção importante — diferente do hábito Tailwind:** em paletas Tailwind, o passo `-500` costuma ser "a cor". Aqui **não** — o tom exato da marca cai perto do `coral-300`/`teal-400` (tons claros, de identidade), e os passos numerados são uma interpolação HSL a partir dele, não o próprio pixel amostrado. Para os casos em que a fidelidade exata de marca importa (recriar a logo, um SVG decorativo), use os **aliases de marca exatos** no bloco de tokens (§7) — `--color-coral-brand` / `--color-teal-brand` — e não o passo da escala mais próximo.

### Coral (`H 1°, S 51%`)

| Passo | Hex | Contraste vs. branco | Uso sugerido |
|---|---|---|---|
| 50 | `#FAF0F0` | 1.12:1 | fundo sutil (hover de card, faixa decorativa) |
| 100 | `#F5E0E0` | 1.26:1 | fundo de badge/tag |
| 300 | `#DF9C9B` | 2.24:1 | ≈ tom de marca — decorativo, ícone grande, nunca texto |
| 500 | `#C64F4E` | 4.54:1 | ✅ passa AA — texto normal, ícone sobre branco |
| 600 | `#AA3937` | 6.27:1 | ✅ AA confortável — texto, borda de estado |
| 700 | `#8B2E2D` | 8.31:1 | ✅ AAA — texto pequeno, alto contraste |
| 950 | `#361211` | 16.78:1 | texto de altíssimo contraste, uso raro |

### Teal / sálvia (`H 173°, S 30%`)

| Passo | Hex | Contraste vs. branco | Uso sugerido |
|---|---|---|---|
| 50 | `#F2F8F7` | 1.07:1 | fundo sutil |
| 100 | `#E4F1EF` | 1.16:1 | fundo de badge/tag |
| 400 | `#87BFB8` | 2.06:1 | tom de marca exato — decorativo, ícone grande, nunca texto |
| 600 | `#4E928A` | 3.62:1 | ✅ passa 3:1 — componente de UI (borda de foco, ícone médio) |
| 700 | `#407871` | 5.07:1 | ✅ AA — texto normal, indicado para `primary` |
| 800 | `#325D58` | 7.39:1 | ✅ AAA — texto pequeno |
| 950 | `#192F2C` | 14.15:1 | texto de altíssimo contraste, uso raro |

Escala completa (todos os passos) fica no bloco de tokens em §7.

## 6. Tema moderno sugerido

Mantém as duas cores de marca como identidade visível (fundos suaves, decoração, estados de destaque), mas usa os tons "ink" derivados (§5) para qualquer texto ou componente interativo — resolve o problema de contraste sem descaracterizar a marca. Cores base:

- **`primary` → teal-700 `#407871`** (não o coral) — o teal já é a cor do texto de contato no papel timbrado original, e tem melhor curva de contraste que o coral em tons médios. Substitui o teal genérico atual do app (`#0f766e`, Tailwind stock) por um tom que vem de fato da marca.
- **`accent`/`brand` → coral-600 `#AA3937`** — reservado para destaque pontual (ex.: um elemento de marca no login, um ícone hero), não para estado semântico. **Não reaproveitar como `danger`** — o app já tem um vermelho semântico próprio (`#dc2626`) para falha/cancelamento; usar o coral da marca ali confundiria "erro" com "cor de marca".
- **Superfícies:** manter fundo branco/neutro como hoje; usar coral-50/teal-50 só como sombreado sutil (hover, faixa decorativa), nunca como fundo de área extensa de leitura.

### 6.1 Estados de botão

O `Button` atual (`src/components/ui/button.tsx`) já usa um padrão consistente — **manter**: `hover:opacity-90`, `disabled:opacity-50` + `disabled:cursor-not-allowed`. Isso funciona bem com os tokens de marca porque opacidade não muda o matiz, só a mistura com o fundo. Gaps reais encontrados nesta revisão:

- **Foco de teclado não existe hoje** — nem `Button`, nem `Input`, nem `Select` têm `focus-visible` com indicador visível além da mudança de borda do input. Para um app usado por profissionais em turnos corridos (alguns em desktop, com teclado), isso é uma lacuna de acessibilidade real, não cosmética. Proposta: `--color-ring` (§7) + `focus-visible:ring-2 focus-visible:ring-ring/50` em todo elemento interativo.
- **Estado "pressed"/ativo** não é distinto do hover hoje — aceitável para o tamanho atual do app; não introduzir um token novo só por simetria (evitar over-engineering). Se necessário no futuro, deriva de `active:opacity-80`, sem novo token de cor.
- **Loading** já tem um padrão implícito bom (`attendee-status-actions.tsx` troca o rótulo por `"..."` durante `isPending`) — não depende de cor, ótimo para acessibilidade (não comunica estado só por cor). Manter esse padrão para qualquer novo botão assíncrono.
- **Alvo de toque mínimo:** o requisito de UX do projeto é ≤ 3 toques em mobile (CLAUDE.md) — isso implica alvos de toque confiáveis. Recomendação: nenhum botão/ação tocável abaixo de `44×44px` de área efetiva, mesmo quando o rótulo visual é pequeno (ex.: os botões de ação de `attendee-status-actions.tsx` hoje usam `text-[11px]` e padding mínimo — vale revisar a área de toque real ao tocar nesse componente, fora do escopo deste documento).

### 6.2 Formulários

`Input`/`Select` (`src/components/ui/input.tsx`, `select.tsx`) hoje só mudam a cor da borda no foco (`focus:border-primary`), sem ring — mesmo gap do §6.1. Dois achados adicionais, verificados por cálculo de contraste real, não estimativa:

- **`--color-border` (`#e5e7eb`) tem só `1.24:1` de contraste contra branco.** Como divisor decorativo (ex.: borda de `Card`) isso é irrelevante. Como borda de um campo de formulário — um limite que o usuário precisa *perceber* para saber onde tocar/clicar — fica abaixo do mínimo recomendado pela WCAG para contorno de componente de UI (`3:1`, critério 1.4.11). Proposta: um token dedicado `--color-input-border`, mais escuro, só para limites de elementos interativos (input, select, botão outline), mantendo `--color-border` como está para divisores puramente decorativos.
- **Sem estado de erro na borda** — hoje o erro só aparece como texto vermelho abaixo do campo (`text-danger`), a borda não muda. Recomendação de padrão (não implementado aqui): `aria-invalid:border-danger` + `aria-invalid` no elemento, para que o erro seja perceptível também por contorno, não só por texto — mesmo padrão que o ecossistema shadcn/Radix já usa (`aria-invalid:border-destructive`), então não é um desvio se/quando a abordagem híbrida da ADR-0018 trouxer componentes shadcn para formulários.

### 6.3 Tabelas

O projeto ainda não tem um componente de tabela — vai precisar de um a partir da fase 2 (financeiro, PRD §6). Registrando a diretriz de token agora para não empurrar essa decisão para quando a pressão de prazo for maior:

- Divisor de linha: `--color-border` (uso decorativo puro, adequado aqui — uma tabela densa com bordas fortes demais vira ruído visual).
- Cabeçalho: fundo `--color-muted`, texto `--color-muted-foreground`, sem depender de cor de marca.
- Zebra (linhas alternadas), se adotada: usar `--color-muted` em opacidade baixa (`muted/50`), **não** `coral-50`/`teal-50` — tingir a tabela inteira de marca compete com a legibilidade de uma grade densa de números (produção, repasse). Reservar o tingimento de marca para o estado de **seleção/destaque de uma linha específica** (ex.: `teal-50` só na linha selecionada), não para o padrão zebra.

### 6.4 Agenda

Componentes existentes verificados: `agenda-grid.tsx` consome `StatusBadge` com tons `neutral | success | warning | danger` (`status-badge.tsx`). Dois achados:

- `success` (`bg-primary/10 text-primary`) e `danger` (`bg-danger/10 text-danger`) já são tokenizados — trocar `primary` para `teal-700` (§6) não quebra nada aqui, o contraste do texto continua ≥ AA (verificado: `~5:1`, a diluição do fundo em `/10` não afeta o texto).
- **`warning` não é tokenizado** — usa classes Tailwind cruas (`bg-amber-100 text-amber-800`), a única cor do app inteiro que não passa por um token semântico. Isso é uma inconsistência real de sistema de design (nada a ver com a marca — é sobre a UI já existente hoje). Proposta em §7: `--color-warning` / `--color-warning-foreground`, mantendo o âmbar (não vira coral — coral já é `accent` de marca, usar para "pendente"/"aguardando confirmação" confundiria as duas semânticas).
- Indicador de "agora" (hora atual na grade) e de conflito de sala não existem como conceito visual ainda — fora do escopo resolver aqui; ao desenhar, usar `--color-accent` (coral) com moderação para o indicador de "agora" é uma opção consistente com a marca, mas isso é decisão de implementação, não de token.

### 6.5 Dashboard

Não existe ainda (fase 2 do roadmap, PRD §6) — nenhuma tela consome cor categórica/gráfico hoje. Não é criada aqui uma paleta de gráficos sem um requisito real para validar contra (evitar o mesmo erro que a ADR-0018 já registrou: não pagar custo de design antecipado sem uso). Fica registrado como gap conhecido: quando o financeiro chegar, os dados categóricos (ex.: produção por fisioterapeuta) vão precisar de uma paleta distinta de `success`/`warning`/`danger` — provavelmente derivada de `teal`/`coral`/neutro em passos alternados, decidido nesse momento.

### 6.6 Tipografia de produto

Uma família geométrica-humanista moderna e altamente legível para headings + corpo (ex. Plus Jakarta Sans, Manrope ou Sora — todas gratuitas via Google Fonts, com peso variável, e um caráter arredondado que ecoa a curvatura da wordmark sem tentar imitá-la). Uma mono para metadados pontuais (horário exato, telefone, código de sessão) — ex. IBM Plex Mono ou Space Mono — ecoando o bloco de contato do papel timbrado, usada com moderação. Tokens propostos em §7 (`--font-sans`, `--font-mono`) — a fonte em si ainda não está carregada no app (§3).

### 6.7 Forma e motivo decorativo

Cantos arredondados moderados (a wordmark e a curva decorativa são todas orgânicas/sem ângulos retos) — manter os `rounded-md`/`rounded-lg` já usados hoje, não achatar para cantos retos; tokens `--radius-*` propostos em §7 para nomear essa escala explicitamente em vez de depender só do default do Tailwind. A curva fina do papel timbrado pode virar um elemento SVG leve e opcional em telas de baixa densidade (login, tela vazia de "nenhuma sessão hoje") — nunca na agenda/grade, onde competiria com a densidade de informação.

### 6.8 Dark mode

O app já alterna `--color-*` via `prefers-color-scheme`. Verificado por cálculo (não só por princípio geral):

- `--color-danger` **não tem variante dark hoje** (nem no app atual, nem na primeira versão deste documento) — `#dc2626` contra o fundo escuro `#0a0a0a` dá `4.10:1`, abaixo do `4.5:1` exigido para texto normal. Corrigido em §7 com `#f87171` (`7.16:1`) para o modo escuro.
- Mesmo problema de contraste de borda do §6.2 se repete no escuro: `--color-border` dark (`#27272a`) contra o fundo escuro é `1.33:1`. Mesma correção — `--color-input-border` ganha um valor dedicado também no bloco dark.
- Os passos usados como `primary`/`accent`/`ring` em modo escuro precisam vir do lado **claro** da escala (300–400), não do lado escuro (700–800) usado no modo claro — confirmado por cálculo: `teal-400` contra o fundo escuro dá `9.59:1` (ótimo), enquanto `teal-700` (usado no claro) contra o mesmo fundo escuro daria contraste baixo demais para funcionar como texto/preenchimento claro sobre fundo escuro. Já refletido no bloco de tokens.

### 6.9 Componentes shadcn/ui (ADR-0018)

A ADR-0018 decidiu uma abordagem híbrida: componentes nativos continuam como estão, shadcn/ui entra só quando um widget real precisar (`Dialog`, `Combobox`, `Toast`). O mesmo ADR registrou que o scaffolding do shadcn (`components.json`, preset `base-nova`) espera tokens **sem prefixo** (`--primary`, `--background`, `--ring` etc.), remapeados via `@theme inline` para o `--color-*` que o Tailwind v4 realmente usa — diferente da convenção direta (`--color-primary` etc.) já usada neste projeto e mantida neste documento. Isso não é um problema a resolver agora (nenhum componente shadcn foi instalado), mas fica registrado o mapeamento para quando o primeiro widget for adicionado, para não repetir o incidente já documentado na ADR-0018 (paleta cinza genérica sobrescrevendo a marca):

| Token deste documento | Token esperado pelo preset shadcn (`base-nova`) |
|---|---|
| `--color-primary` / `--color-primary-foreground` | `--primary` / `--primary-foreground` |
| `--color-accent` / `--color-accent-foreground` | `--accent` / `--accent-foreground` |
| `--color-background` / `--color-foreground` | `--background` / `--foreground` |
| `--color-border` | `--border` |
| `--color-input-border` (§6.2) | `--input` |
| `--color-ring` | `--ring` |
| `--color-danger` | `--destructive` |
| `--radius-*` (§7) | `--radius` (shadcn usa um único valor-base e deriva `sm/md/lg/xl` por `calc()`) |

## 7. Design Tokens (Tailwind v4)

Proposta de bloco `@theme`, no mesmo formato já usado em `src/app/globals.css` (Tailwind v4, CSS-first, sem `tailwind.config`). **Não aplicado ainda** — fica aqui como referência para quando a decisão de adoção for tomada.

```css
@theme {
  /* Marca — aliases exatos (pixel-perfect, ver §5) — só para reprodução fiel da marca, não para UI de texto */
  --color-coral-brand: #de9a99;
  --color-teal-brand: #87bfb8;

  /* Marca — Coral (wordmark, acentos pontuais) */
  --color-coral-50: #faf0f0;
  --color-coral-100: #f5e0e0;
  --color-coral-200: #ebc2c1;
  --color-coral-300: #df9c9b; /* ≈ tom de marca — ver --color-coral-brand para o valor exato */
  --color-coral-400: #d27674;
  --color-coral-500: #c64f4e; /* primeiro passo com AA em texto */
  --color-coral-600: #aa3937; /* accent/brand recomendado */
  --color-coral-700: #8b2e2d;
  --color-coral-800: #6c2423;
  --color-coral-900: #4d1a19;
  --color-coral-950: #361211;

  /* Marca — Teal / sálvia (wordmark, texto de contato) */
  --color-teal-50: #f2f8f7;
  --color-teal-100: #e4f1ef;
  --color-teal-200: #cae3e0;
  --color-teal-300: #a9d1cc;
  --color-teal-400: #87bfb8; /* tom de marca exato — igual a --color-teal-brand */
  --color-teal-500: #66ada4;
  --color-teal-600: #4e928a; /* primeiro passo com 3:1 (componentes) */
  --color-teal-700: #407871; /* primary recomendado — AA em texto */
  --color-teal-800: #325d58;
  --color-teal-900: #23433f;
  --color-teal-950: #192f2c;

  /* Papéis semânticos — mapeando para a escala de marca */
  --color-background: #ffffff;
  --color-foreground: #171717;
  --color-border: #e5e7eb; /* divisores decorativos (Card, hr) — não usar em elementos interativos */
  --color-input-border: #919191; /* 3.15:1 vs. branco — bordas de Input/Select/Button outline */
  --color-ring: var(--color-teal-600); /* foco de teclado — 3.62:1, passa 1.4.11 */
  --color-primary: var(--color-teal-700);
  --color-primary-foreground: #ffffff;
  --color-accent: var(--color-coral-600);
  --color-accent-foreground: #ffffff;
  --color-muted: #f3f4f6;
  --color-muted-foreground: #6b7280;
  --color-danger: #dc2626; /* mantém — não confundir com --color-accent */
  --color-danger-foreground: #ffffff;
  --color-warning: #fef3c7; /* fundo — âmbar já usado hoje em status-badge.tsx (amber-100), agora tokenizado */
  --color-warning-foreground: #92400e; /* texto sobre --color-warning — mesma direção de --color-muted/--color-muted-foreground, não a de --color-primary */

  /* Tipografia (ver §6.6) — ainda não carregada no app, ver §3 */
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;

  /* Forma — nomeando a escala já usada informalmente hoje (rounded-md/rounded-lg) */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: #0a0a0a;
    --color-foreground: #ededed;
    --color-border: #27272a;
    --color-input-border: #5d5d5d; /* 3.01:1 vs. fundo escuro */
    --color-ring: var(--color-teal-400); /* 9.59:1 vs. fundo escuro */
    --color-primary: var(--color-teal-400);
    --color-primary-foreground: #0a0a0a;
    --color-accent: var(--color-coral-400);
    --color-accent-foreground: #0a0a0a;
    --color-muted: #18181b;
    --color-muted-foreground: #a1a1aa;
    --color-danger: #f87171; /* 7.16:1 — #dc2626 original cai para 4.10:1 no escuro, abaixo de AA */
    --color-danger-foreground: #0a0a0a;
    --color-warning: #451a03; /* fundo escuro — mesma direção de --color-muted no dark, não um fill saturado */
    --color-warning-foreground: #fcd34d; /* 10.39:1 vs. --color-warning */
  }
}
```

Notas de uso:

- `--color-primary` troca de `#0f766e` (teal genérico atual) para `--color-teal-700`, derivado da marca de verdade.
- `--color-accent`, `--color-ring`, `--color-input-border` e `--color-warning` são **novos** — não existem hoje no app. `--color-warning`/`--color-warning-foreground` formalizam os valores (`amber-100`/`amber-800`) já usados como classes cruas em `status-badge.tsx` — na mesma direção de `--color-muted`/`--color-muted-foreground` (fundo claro, texto escuro), não na de `--color-primary`/`--color-primary-foreground` (fundo saturado, texto branco), já que `warning` hoje só existe como badge, nunca como preenchimento sólido de botão. Os outros três tokens preenchem gaps de acessibilidade reais encontrados nesta revisão (§6.1, §6.2, §6.8), não vêm da marca.
- Os passos `300`/`400` (tom exato da marca) e os aliases `-brand` ficam disponíveis na escala para uso decorativo (ex. a curva SVG do §6.7), mas não devem virar `--color-primary`/`--color-accent` diretamente — falham contraste, como mostrado em §2 e §5.
- `--color-danger` muda de valor entre claro e escuro (mesma cor semântica, tom recalibrado) — os componentes que a consomem (`Input`/`Select` error, `StatusBadge` danger) não precisam mudar, só o token.

## 8. Próximos passos (não executados aqui)

- Pedir/gerar uma versão vetorial (SVG) da wordmark — o único ativo hoje é um PNG de ~2500px embutido em `.docx`, que não escala bem para favicon/app icon/retina.
- Quando a decisão de adotar estes tokens for tomada, aplicar em `src/app/globals.css` e validar contraste real na UI (não só nos números isolados acima) — trabalho de código, fora do escopo deste documento.
- Cruzar com a ADR-0018 (design system híbrido): os tokens de marca aqui propostos servem tanto para os componentes nativos existentes quanto para os futuros componentes shadcn/ui, quando/se forem adicionados — ver §6.9 para o mapeamento de nomes.
- Quando um componente de tabela for de fato construído (fase 2), revisitar §6.3 com um caso real em vez de diretriz antecipada.
- Quando o financeiro/dashboard chegar (fase 2), definir a paleta categórica de gráficos com um requisito real na mão (§6.5) — não antes.

## 9. Registro de revisão

- **2026-07-20 — Auditoria de arquitetura de design system.** Revisão dos tokens propostos contra: consistência entre si, escalas de cor, tipografia, acessibilidade (contraste calculado, não estimado), estados de botão, formulários, tabelas, agenda, dashboard, dark mode e o mapeamento para componentes shadcn/ui. Mudanças: adicionados `--color-ring`, `--color-input-border`, `--color-warning`(+dark), `--color-danger` dark, aliases `-brand` exatos, passo `950` nas duas escalas, tokens de tipografia e de raio de borda; adicionadas as subseções 6.1–6.9; corrigido o gap de contraste de `--color-danger` em modo escuro (`4.10:1` → `7.16:1`) e o de bordas de campo interativo (`1.24:1` → `3:1` mínimo). Nenhuma cor de marca (§2) mudou — só os tokens semânticos derivados.
- **2026-07-20 — Segunda passada, pré-commit.** Corrigidos dois valores contraditórios encontrados na verificação: (1) `--color-warning`/`--color-warning-foreground` estavam invertidos (o texto escuro `#92400e` estava no papel de fundo e vice-versa) — corrigido para a mesma direção de `--color-muted`/`--color-muted-foreground`, nas duas variantes claro/escuro; (2) `--color-input-border` claro (`#959595`) arredondava para `2.995:1`, abaixo do mínimo de `3:1` documentado — ajustado para `#919191` (`3.15:1`), com margem de segurança.
