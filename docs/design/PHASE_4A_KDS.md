# Fase 4A — Cozinha / KDS

> Auditoria de contrato registrada antes das alterações de interface. Fonte visual oficial: `DESIGN_SYSTEM.md`; `docs/design-system.md` permanece legado.

## Auditoria anterior à implementação

### Arquitetura anterior

- `KitchenView.vue` abria na aba `dashboard`; as abas seguintes filtravam a fila por estado. Em telas largas, a aba ativa mostrava cards em grade, não colunas operacionais simultâneas.
- A tela mantinha cabeçalho de página, atualização manual, estado realtime, erros, métricas, detalhe da comanda e impressão.
- `KitchenItems.vue` apresentava linhas, modificadores, notas de item e nota do pedido. `KitchenTicketSheet.vue` buscava o recurso de comanda e mantinha pré-visualização/impressão.
- `KitchenDashboardPanel.vue` e componentes associados são a leitura secundária de métricas e fluxo. A fila e o painel usam read models distintos.

### Status, ações e transições reais encontrados

Fonte do contrato frontend auditado: `src/types/kitchen.ts`, `src/services/kitchen.service.ts`, `src/composables/useKitchenOrders.ts` e `KitchenView.vue`.

| Status real | Ação oferecida pela aplicação | Próximo status conhecido pelo fluxo |
| --- | --- | --- |
| `confirmed` | `accept` | `accepted` |
| `accepted` | `preparing` | `preparing` |
| `preparing` | `ready` | `ready` |
| `ready` | nenhuma ação KDS | — |

As ações existentes são protegidas por `update_kitchen_status`; leitura da tela usa `update_kitchen_status` **ou** `serve_orders`. A rota `app-kitchen` declara essas mesmas permissões. Esta fase não amplia nem restringe esses gates. O servidor continua autoridade para cada transição.

O cliente chama os endpoints existentes por `kitchenService.transition(order.id, action)`. A fila não é atualizada otimisticamente: após sucesso ou erro, inclusive resposta ambígua, ela é recarregada do servidor. Não há transição inversa documentada no contrato frontend auditado; portanto não há Undo seguro.

### Dados disponíveis e limites do contrato

`KitchenOrder` contém: `id`, `order_number`, `status`, `origin`, restaurante (`id`, `name`), mesa (`id`, `name`, `number`), `order_note`, `created_at`, `elapsed_seconds` e itens com `id`, `name`, `quantity`, `note` e modificadores (`group_name`, `name`).

- O tempo já vem como `elapsed_seconds` calculado pelo servidor. Hoje a UI avança esse valor localmente desde `receivedAt`, sem usar relógio local para inventar o tempo inicial; apresenta minutos decorridos.
- Não foi encontrado threshold de warning/critical no contrato da fila nem configuração aplicável. Nesta fase o tempo permanece informativo, sem escalonamento de cor ou limite inventado. **[contrato pendente]**
- Não há campo de alérgenos em `KitchenOrder`, `KitchenItem` ou `KitchenTicket`. A UI não pode fabricar ou inferir essa informação. **[contrato pendente]**
- Pedido e itens têm notas textuais. Não foi encontrado contrato separado de modificadores críticos ou sinalização de alérgenos.
- A fila ordena `created_at` crescente, com `id` como desempate, e limita a leitura a 100 pedidos; a UI informa esse limite quando recebe exatamente 100.
- `KitchenDashboard` é uma leitura separada com contagens, `oldest_active_order_age_seconds`, `longest_ready_wait_seconds`, médias por etapa, produtos e pedidos recentes. Métricas podem continuar acessíveis secundariamente; não definem novos estados nem thresholds da fila.

### Realtime, carga, falhas e áudio

- `useRestaurantRealtime` subscreve `restaurant.{id}`, valida restaurante/schema/event id, deduplica eventos e invalida leituras REST. Atualiza a fila e dashboard por refetch; inclui recuperação na reconexão, fallback desconectado e reconciliação lenta conectado. Nenhuma mutation local de status vem do payload.
- `order.created` e `order.status_changed` fazem parte do catálogo de eventos que provoca refresh. O envelope tipado não oferece um identificador de pedido utilizável para inserir/patch localmente.
- A aplicação já tem `useReadyOrderNotifications` global no shell para o evento pessoal `order.ready.attention`; essa infraestrutura não será duplicada ou movida para a tela da cozinha.
- Não foi localizada lógica de áudio na `KitchenView`, nos seus componentes ou composables diretos. A política global existente não será alterada.
- A fila limpa os dados imediatamente em perda de autorização/autenticação/404. Outros erros permanecem no estado e são apresentados; realtime não remove conteúdo carregado.
- A tela tinha loading com spinner, empty state reutilizado e mensagens inline de erro. Não há `ASkeleton`, `AAlert` ou `AErrorState` compartilhado em `src/components/ui`; a implementação KDS poderá usar estruturas locais e semânticas sem criar uma dependência global nesta fase.

### Arquivos e responsabilidades auditados

- Tela/ações: `src/views/kitchen/KitchenView.vue`, `src/composables/useKitchenOrders.ts`, `src/composables/useKitchenDashboard.ts`.
- Contratos/serviços: `src/types/kitchen.ts`, `src/types/realtime.ts`, `src/services/kitchen.service.ts`, `src/composables/useRestaurantRealtime.ts`.
- Apresentação: `src/components/kitchen/KitchenItems.vue`, `KitchenTicketSheet.vue`, `KitchenDashboardPanel.vue`, `KitchenQueueFlow.vue` e componentes importados por eles.
- Acesso/rota: `src/router/index.ts`; permissão da página e gate de leitura/mutação acima.
- Tema e primitivas existentes: tokens SALOA V2, `AButton`, `AStatusBadge`, `ABottomSheet`; os tokens atuais já incluem surfaces, radius, elevation, motion e z-index. A escala Tailwind é baseada em 4 px. O papel tipográfico `text-timer` de 28/32 definido no Design System ainda não está integrado no Tailwind e poderá ser implementado estritamente para o KDS.
- Testes existentes: suites de shell, primitivas responsivas, tokens, realtime, hardening e segurança; não havia suite dedicada à tela KDS antes desta fase.

### Direção de implementação decidida a partir da auditoria

O primeiro conteúdo será a fila. Em tablet landscape e desktop ela usará colunas derivadas apenas de `KITCHEN_STATUSES`, mantendo cada coluna ordenada pela fila do servidor. Em 1024–1179 serão priorizadas três colunas; entre 768–1023 duas; abaixo de 768 uma coluna por vez com seleção por controles acessíveis. As métricas ficam numa área secundária. A ação principal será a ação real existente para o status, com alvo KDS de 56 px. Detalhes/impressão continuam disponíveis como ações secundárias.

O componente de ticket receberá dados e apresentação visual; qualquer mapeamento de estado para badge será separado do componente. Nenhuma regra operacional, status, threshold, rota, permissão ou contrato será introduzido.

---

## Resultado da Fase 4A

### 1. Arquitetura anterior e arquitetura nova

A tela anterior iniciava no painel de métricas e alternava entre quatro filtros de status. A nova tela inicia em `queue`: tablet/desktop exibem colunas simultâneas; no compact há um grupo de radios nativo para escolher um status. O painel de métricas continua acessível pelo controle secundário “Ver métricas” e mantém os seus dados e componentes.

`AKitchenTicket.vue` centraliza o cartão operacional. `kitchen-status-presentation.ts` mapeia os status reais para ícones e estados visuais do `AStatusBadge`; o componente visual não importa tipos ou serviços do backend. `kitchen-realtime-arrivals.ts` compara IDs de pedidos já recebidos e destaca uma só vez os IDs novos após `order.created` e refetch. A fila em si continua sempre vindo da API.

### 2. Status, transições e ações

Mantidos exatamente os quatro status: `confirmed`, `accepted`, `preparing`, `ready`. Ações existentes: `accept`, `preparing`, `ready`, respectivamente para os três primeiros. `ready` não oferece transição KDS. Cada ticket tem uma ação principal de largura total e alvo de 56 px. “Ver detalle” é secundário; abre o `ASheet` bottom com os mesmos dados e mantém acesso à comanda/ impressão.

Não há otimização especulativa nem Undo. `useKitchenOrders.advance` continua aguardando POST e refetch autoritativo mesmo em erros ambíguos; não há endpoint inverso ou transição reversa segura auditada. O feedback de erro continua visível e os pedidos não são removidos por falha realtime comum.

### 3. Layout por breakpoint

| Largura CSS | Comportamento |
| --- | --- |
| `<768` | uma coluna por status; quatro opções de rádio com contagem, em duas linhas; scroll vertical da página |
| `768–1023` | duas colunas simultâneas; scroll horizontal interno com snap se a área útil, incluindo rail, exigir |
| `1024–1179` | três colunas, scroll horizontal controlado/snap quando necessário |
| `≥1180` | até quatro colunas, largura mínima de 280 px por trilho e scroll interno planejado |

Cada coluna tem cabeçalho sticky e scroll próprio. No mobile a lista continua na rolagem da página e não tenta comprimir quatro colunas. O ticket permite quebra de nomes, mesa, pedido, modificadores e notas.

### 4. AKitchenTicket, tempo e estados

O timer (`text-timer`, 28/32, peso 700, tabular) é a primeira informação do ticket. Usa o `elapsed_seconds` do servidor como base e conserva o intervalo local de um segundo que apenas atualiza a apresentação, como na tela anterior. A interface mostra minutos decorridos, sem classificação de warning/critical, limites ou SLAs novos. **Thresholds: contrato pendente.**

Mesa/pedido, badge textual com ícone, itens/quantidade, modificadores, notas e ação vêm depois do tempo. Quantidade e nome dos itens usam o papel KDS de 17/22. Notas de pedido ficam sempre visíveis em superfície warning-subtle e notas de item permanecem junto ao item. Não há campo de alérgenos disponível no contrato de fila ou ticket; não foi inferido a partir de nomes/modificadores. **Alérgenos: contrato pendente.**

No Light e Dark são usados os tokens SALOA V2 sem novos hex. O ticket usa elevação `raised`, borda hairline e superfície; no Dark a sombra raised vira flat e a separação permanece tonal/com hairline. Nenhum tema é forçado.

### 5. Movimento e chegada realtime

Mudanças de coluna e reordenações usam `TransitionGroup` nativo do Vue com `--duration-base` (200 ms), translate/opacity discreto e sem bounce. `prefers-reduced-motion` desliga a transição. Elementos que saem ficam inertes durante o fim da animação. Um pedido novo recebe um único destaque de 600 ms após o evento de criação e a confirmação da lista REST; não há pulse contínuo.

`useRestaurantRealtime` não foi modificado: mantém canal `restaurant.{id}`, deduplicação, refresh por evento, reconexão, fallback e reconciliação. Não se fez polling novo nem patch local a partir do payload. O alerta pessoal `order.ready.attention` segue no shell global sem duplicação no KDS. Não foi encontrada política de áudio na tela ou composables do KDS e nenhuma foi acrescentada.

### 6. Loading, empty e erro

Na primeira carga da fila aparecem esqueletos com geometria de tickets e colunas. Realtime/refresh mantém a lista atual; erros persistentes ficam visíveis com retry manual, sem apagar pedidos já lidos salvo os casos de perda de autorização/autenticação/404 que o composable já limpa. Colunas sem pedidos mostram mensagem simples. O sheet da comanda também usa skeleton; detalhe e impressão usam `ASheet` para foco, Escape, safe-area e adaptação ao teclado. Não havia `ASkeleton`, `AAlert` ou `AErrorState` compartilhado disponível; foram usadas estruturas locais ao KDS, sem criar componentes globais.

### 7. Acessibilidade, shell e áreas não migradas

- O seletor mobile é um `fieldset` de radios, com nomes e contagens, seleção legível e teclado nativo.
- Há um `h1`; cabeçalhos de coluna são `h2`; erros e conexão têm regiões semânticas.
- Status sempre combina texto, ícone e estilo. Foco visible, alvos: 56 px na ação; 48 px em seleção/controle secundário; quebra de conteúdo e reduced motion.
- Detalhes e comanda usam `ASheet` da Fase 2, incluindo focus trap/retorno, Escape, scroll lock, VisualViewport e safe-area existentes.
- O conteúdo continua dentro do `AppShellLayout` legado ou V2; o flag não foi habilitado por padrão. Não foi criado metadata de rota ou modo imersivo. Nenhum arquivo de shell, rota ou tela de outro domínio foi alterado.
- `KitchenItems.vue` também é usado na pré-visualização de impressão; a hierarquia de notas/itens foi atualizada para SALOA e a interface de props permaneceu igual. Estilos de impressão existentes foram mantidos.

### 8. Arquivos alterados e componentes

- Criado: `src/components/kitchen/AKitchenTicket.vue`.
- Criados: `src/utils/kitchen-status-presentation.ts`, `src/utils/kitchen-realtime-arrivals.ts`.
- Evoluídos: `src/views/kitchen/KitchenView.vue`, `src/components/kitchen/KitchenItems.vue`, `src/components/kitchen/KitchenTicketSheet.vue`.
- Tokens semânticos tipográficos SALOA adicionados a `src/style.css`: component title, body/body-small, item KDS (17/22) e timer (28/32). A escala de spacing existente foi preservada; nenhum token de cor, radius, shadow, z-index ou motion novo foi criado.
- Traduções novas de fila/métricas/loading/contagem nos três locales suportados: `es-ES`, `en-GB`, `ca-ES-valencia`.
- Teste novo: `tests/frontend-kitchen.mjs`.
- Este relatório: `docs/design/PHASE_4A_KDS.md`.

Nenhuma API pública de serviço ou componente existente foi removida/renomeada. `KitchenItems` mantém `{ items, note }`; ticket e apresentação são novos componentes internos. Nenhum backend, store, autenticação, permissão, contrato, estado de domínio ou rota foi alterado. Nenhum status ou threshold foi inventado.

### 9. Testes e builds

- `npm run build` — passou.
- `VITE_SHELL_V2=true npm run build` — passou; não habilita V2 como padrão.
- `node tests/frontend-kitchen.mjs` — passou; contrato real de status/ações, mapeamento visual, chegada realtime unitária, conteúdo e eventos do ticket, breakpoints, alvos e motion.
- `node tests/frontend-shell.mjs` — passou (29 verificações de permissões/navegação e breakpoints do shell).
- `node tests/frontend-primitives.mjs` — passou (93 verificações montadas, foco por teclado, snackbar e primitivas).
- `node tests/frontend-primitives-responsive.mjs` — passou (54 cenários CSS de viewport/pointer/zoom e geometria).
- `node tests/frontend-design-tokens.mjs` — passou (50 cores, 72 pares WCAG e 81 utilities compiladas).
- `npm run test:hardening` — passou (115 checks e 18 fail-fast builds + 2 builds HTTPS/WSS).
- `npm run test:security` — passou (54 checks).
- `tests/frontend-realtime.mjs` e `tests/frontend-approvals.mjs` foram tentados, mas o navegador local não iniciou: Chrome encerra por falta de `libnspr4.so`. Dependências do sistema não foram instaladas. O helper de chegada realtime novo foi coberto por teste sem browser.
- Não há script de lint definido no `package.json`.

### 10. Regressões, riscos e validação visual

Na revisão, removemos o dashboard da entrada principal, retiramos a etiqueta “mais antigo” redundante, reduzimos a hierarquia de cabeçalho/metrics, mantivemos notas sem truncamento e substituímos o spinner central por skeletons. Erros de leitura mantêm o conteúdo já carregado, e transições preservam uma posição de foco útil. Não foi encontrada regressão de contrato, permissão ou rota.

**Validação estrutural concluída:** CSS e componente cobrem 375 px, tablet portrait 768 px, 1024 px landscape, 1180/1280 px e desktop 1440 px; orientação mobile landscape, wrapping, scroll interno planejado, targets, teclado/reduced-motion e zoom foram revisados em código/testes. Light/Dark usam os valores dos tokens e o teste de tokens confirma os pares já documentados.

**Validação visual real continua pendente:** não há screenshot nem layout engine disponível neste ambiente porque Chrome falha na carga de `libnspr4.so`. Portanto não declaro pixel-perfect e recomendo conferir em tablet de cozinha real: 1024 landscape, portrait, teclado aberto no sheet, nomes/notas longas e Light/Dark com o Shell legado e V2.

Riscos/contratos pendentes: thresholds de tempo e dados de alérgenos não existem nos tipos auditados; o navegador realtime completo e screenshots não foram validados visualmente; português não é um locale atualmente suportado. Nenhuma dessas lacunas foi preenchida com hipótese.

### 11. Dívida para Fase 4B

- Fechar com produto/backend os contratos de thresholds de tempo e alérgenos, se forem necessários; só então apresentar estados semânticos associados.
- Validar a largura efetiva das colunas e legibilidade à distância com screenshots/dispositivo real, inclusive shell V2 e shell legado.
- Rodar browser suites completas quando Chrome puder abrir; revisar anúncios de leitores de tela e o movimento entre colunas em dispositivo real.
- Avaliar posterior integração com modo imersivo somente se a arquitetura de rota existente definir essa necessidade. A tela desta fase não criou metadata nem alterou shell.
- Nenhuma tela fora do KDS foi iniciada nesta fase.
