# ADR-0005 — PWA responsiva em vez de app nativo

- **Status:** Aceito
- **Data:** 2026-07-17

## Contexto

O risco nº 1 do produto é adoção: as fisioterapeutas nunca usaram software de gestão e operam por papel/WhatsApp. Elas usam o celular entre sessões (interações ≤ 30s); Angélica e Patricia usam desktop para gestão. As notificações críticas do MVP vão para o **paciente** (via WhatsApp), não para a fisioterapeuta — o argumento clássico pró-nativo (push) não se aplica.

## Decisão

Aplicação web responsiva instalável (PWA), servida pelo próprio Next.js. A mesma aplicação atende as duas experiências do PRD — mobile-first para as fisios, desktop para gestão — variando layout, não produto. Distribuição por link + "adicionar à tela inicial".

## Alternativas consideradas

- **React Native / Expo** — experiência nativa e push notifications, mas segundo código-base (ou setup universal complexo), ciclo de release via lojas, e a dupla de gestão precisaria de web de qualquer forma.
- **Nativo (Swift/Kotlin)** — melhor UX possível; custo proibitivo para o estágio, duas plataformas.

## Consequências

- Zero fricção de instalação — o caminho de menor resistência para o público mais avesso a software.
- Deploy instantâneo sem loja; um único código para mobile e desktop.
- Sem push notification confiável em iOS antigo — aceitável no MVP (notificações vão ao paciente por WhatsApp). Reavaliar se surgir requisito de notificar a fisioterapeuta em tempo real.
