# Regras de desenvolvimento frontend

Diretrizes gerais de UX/acessibilidade/qualidade para qualquer trabalho de frontend neste projeto. Complementam o [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (tokens de cor/tipografia derivados da marca) e os ADRs — em caso de conflito com uma decisão já registrada em ADR, o ADR prevalece (ver nota sobre shadcn/ui abaixo).

> **Adotado em 2026-07-21**, a partir de um conjunto de regras trazido pelo usuário.

## Princípios gerais

- Mobile-first.
- Acessibilidade antes de estética.
- Consistência antes de originalidade.
- Interfaces simples são preferíveis.
- Nunca introduzir complexidade visual sem benefício claro de UX.
- Toda tela deve parecer pertencer ao mesmo design system.

## shadcn/ui — nota de escopo importante

Este documento originalmente trazia a regra "antes de criar qualquer UI, buscar no registro shadcn, nunca reinventar um componente já disponível". **Essa regra não se aplica neste projeto** — o [ADR-0018](../adr/0018-design-system-hibrido-shadcn.md) já decidiu explicitamente o oposto: manter os componentes nativos (`Button`, `Card`, `Input`, `Select`, `StatusBadge`, `LinkButton`) como estão, e introduzir shadcn/ui **apenas quando um widget real que HTML nativo não cobre bem aparecer** (`Dialog`, `Combobox`, `Toast`, date picker) — nunca como adoção preventiva. O ADR documenta um incidente real (o CLI do shadcn sobrescreveu `button.tsx` e a paleta da marca sem aviso) que motivou essa decisão.

Se, no futuro, a decisão for revisitada (ver "Quando revisitar" no próprio ADR-0018), o caminho correto é abrir um novo ADR marcando o 0018 como *Superseded* — não aplicar a regra silenciosamente.

Tudo o que segue abaixo (composição, formulários, tabelas, diálogos, acessibilidade, revisão final) se aplica normalmente, seja o componente nativo ou shadcn/ui.

## Filosofia de componentes

Favorecer composição em vez de componentes monolíticos grandes. Preferir padrões como `Card`, `Dialog`, `Sheet`, `Drawer`, `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Accordion`, tabela de dados, `Badge`, `Alert`, `Skeleton` — nativos hoje, shadcn/ui quando a necessidade real justificar (ver nota acima).

## Estilo visual

Produto é um SaaS de saúde profissional. A UI deve comunicar confiança, clareza, velocidade e profissionalismo. Evitar: gradientes excessivos, glassmorphism, animações chamativas, ícones superdimensionados, estética "gaming". Animações devem ser sutis e com propósito.

## Regras de UX

Toda tela deve responder "o que o usuário está tentando fazer?". Otimizar para: mínimo de cliques, baixa carga cognitiva, hierarquia óbvia, escaneamento rápido. Evitar ações escondidas — ações primárias sempre visíveis imediatamente.

## Formulários

Sempre: validar inline, mostrar erros úteis, preservar o que o usuário digitou, autofocar o primeiro campo, mostrar estado de carregamento, desabilitar envio duplicado.

## Tabelas

Preferir: ordenação, filtro, paginação, estados vazios, skeleton de carregamento, comportamento responsivo. Nunca construir tabela HTML crua se um padrão adequado já existir (nativo ou shadcn, conforme a nota acima) — hoje o projeto ainda não tem um componente de tabela real (ver `DESIGN_SYSTEM.md` §6.3).

## Diálogos

Usar diálogos só para: confirmação, edição rápida, ações destrutivas. Fluxos grandes devem usar páginas dedicadas.

## Acessibilidade (obrigatória)

Toda UI deve incluir: navegação por teclado, foco visível, aria labels, HTML semântico, contraste suficiente.

## Qualidade de código

Preferir componentes pequenos e reutilizáveis, nomes claros, estado simples, props previsíveis. Evitar abstrações prematuras.

## Ao redesenhar uma tela

Não bastar melhorar cores. Revisar: hierarquia de informação, espaçamento, alinhamento, fluxo de interação, legibilidade, acessibilidade, responsividade. Questionar o layout atual se existir uma UX melhor. Explicar o porquê de cada decisão de design.

## Checklist antes de considerar uma tarefa de frontend concluída

- [ ] Consistência visual
- [ ] Acessibilidade
- [ ] Responsividade
- [ ] Reuso de componente (nativo ou shadcn, conforme ADR-0018)
- [ ] Performance
