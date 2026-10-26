# Fase 4B — Garçom / Serviço

> Nome do produto ainda não definido. Este relatório usa “produto” e registra a implementação anterior à migração antes de qualquer alteração de componente. Referência visual: `DESIGN_SYSTEM.md`; `docs/design-system.md` permanece legado.

## Auditoria anterior à implementação

### Arquitetura atual

- `ServiceView.vue` é uma única tela vertical, igual em mobile e desktop: banner de operação diária, pedidos `waiting_approval`, alertas do snapshot operacional, lista de mesas, disponibilidade de produtos e resumo pessoal de avaliações.
- Aprovações aparecem antes das mesas, mas ocupam uma seção inteira e cada pedido oferece “Ver pedido” e “Aprobar”. Os alertas levam à mesa, sem executar resolução diretamente nessa lista.
- As mesas são linhas em lista, ordenadas localmente por uma prioridade já existente na tela: contas/chamados, prontos, aprovações/preparo, demais ocupadas e livres; empate por nome. Tiles não mostram contexto operacional completo.
- O detalhe é `TableDetailsDrawer`, componente compartilhado com o Dashboard. Em compact é uma gaveta inferior até 85vh; a partir de `sm` vira um painel fixo à direita de 384 px. Possui `role="dialog"`, mas não associa modalidade, scrim, Escape, trap de foco ou scroll lock. Ações e dados ficam num fluxo longo, sem footer fixo.
- `TransferTableDialog` é overlay próprio centralizado, `z-[60]`, sem o comportamento modal compartilhado dos primitivos.
- `TablesView.vue` é configuração de planta; não fornece a grade operacional do Serviço. Seus andares/zonas são configuração existente, mas Serviço recebe zonas pelo snapshot `operations/live` e lista também mesas sem zona.

### Estados e dados reais

Fonte: `OperationsLiveSnapshot`, `OperationsTable`, `FloorPlanTable`, `Order`, `TableRequest`, `SessionBill` e os serviços/composables correspondentes.

- Estados operacionais de mesa disponíveis em `primary_status`: `free`, `occupied`, `waiting_approval`, `preparing`, `ready`, `waiter_requested`, `bill_requested`. Estados de configuração (`active`, `blocked`, `inactive`) são outro domínio e não serão misturados.
- `OperationsTable` pode trazer nome/número/capacidade/zona, layout, `flags`, sessão ativa (início, duração, pessoas, waiter atribuído), contagens de pedidos e resumo financeiro. `OperationsLiveSnapshot` também traz zonas/andares, staff, alertas tipados como strings abertas, resumo, operação diária, cozinha e timestamp.
- Pedidos pendentes vêm de `GET /orders` com `restaurant_id` e `status=waiting_approval`; cada `Order` já contém mesa, número, itens, notas, totais e `created_at`. A idade usada pela tela atual é calculada da data de criação. `useOrderApprovals` controla `approve`/`reject`, atualiza a partir da resposta autoritativa, reconcilia falhas ambíguas e refaz a lista em conflito; não é otimista.
- Alertas reais do snapshot: `active_table_unassigned`, `assigned_waiter_off_shift`, `assigned_waiter_suspended`, `customer_waiter_request_pending`, `bill_request_pending`, `responsible_waiter_call_pending`, `order_waiting_approval`, `order_ready`. Severidade existente: `info`, `warning`, `critical`; cada alerta pode trazer mesa/sessão/usuário e `age_seconds`. A ordem atual é agrupada pelo painel em severidade `critical`, `warning`, `info`.
- Chamados feitos pelo cliente são `TableRequest` (`call_waiter` / `request_bill`) com estados `pending`, `acknowledged`, `completed`, `cancelled`; no detalhe, `handle_table_requests` permite reconhecer pendente e concluir reconhecido. O chamado feito por funcionário via `WaiterCall` é entidade distinta e usa `assign_waiters`.
- `TableBillPanel` carrega os detalhes financeiros da sessão, pagamentos e `can_close` calculado pelo servidor. `record_payments` permite registrar pagamento; `close_bill` e/ou `manage_tables` controlam fechamento conforme a ação já existente. Pagamento e fechamento aguardam confirmação do servidor.
- `TableOrdersList` usa histórico paginado por sessão. Aprovação exige `approve_customer_orders`; marcar servido exige `serve_orders`; a API retorna o pedido atualizado e conflito/not-found atualiza a lista. “Pronto” não é inventado nem inferido na apresentação.
- A lista fallback `GET /restaurants/{id}/tables`, usada para combinações reais de permissão que não podem acessar `operations/live`, só distingue mesa livre/ocupada e tem sessão simples (pessoas/abertura); não fornece waiter atribuído, flags, contagens ou cobrança. A transformação existente preenche apenas os campos visuais necessários e mantém esses dados indisponíveis.
- `TableDetailsDrawer` também contém abrir mesa (`manage_tables`), criar pedido (`create_orders`), atribuir/remover waiter e chamar responsável (`assign_waiters`), transferir (`transfer_tables`), leitura de pedidos conforme o conjunto de permissões atual, ver cobrança/recibo (`record_payments` ou `close_bill`) e fechar sessão (`manage_tables` ou `close_bill`). Nenhum gate será alargado ou reduzido.
- Disponibilidade é apresentada quando `manage_product_availability` ou `manage_products`; alteração chama `setAvailability`, só aplica a resposta do servidor e agenda refresh. Avaliações pessoais só aparecem com `serve_orders` e vêm de `GET /me/feedback-summary`.

### Prioridade existente e limites

- A prioridade anterior é composta por regras já presentes: aprovações aparecem primeiro; o painel de alertas preserva a ordem do backend dentro dos grupos de severidade; a lista de mesas usa `attentionRank` descrito acima. A migração não criará SLA, threshold, severidade, categoria nem regra de prioridade temporal nova.
- A faixa “Agora” poderá reunir aprovações existentes e alertas existentes. Aprovar mantém o fluxo direto já presente; demais alertas abrem a mesa correspondente, para o detalhe existente resolver a ação correta. Se alertas não vierem no snapshot, não serão reconstruídos a partir de contagens.
- O filtro “Mis mesas” só pode aparecer no caminho em que o snapshot fornece waiter atribuído e a identidade atual pode ser comparada sem hipótese. O fallback não oferece atribuição; não será aplicado filtro enganoso ali. Zonas são dados confiáveis no snapshot, mas mesas sem zona devem continuar acessíveis.
- Não há classificação de tempo por limite para chamados/mesas neste fluxo. Tempos só serão apresentados quando o campo/fonte atual os fornece; sem thresholds, não haverá warning/critical por idade.

### Realtime, loading e erro

- `useRestaurantRealtime` subscreve `restaurant.{id}`, valida e deduplica eventos e invalida os dados REST. Eventos atuais incluem sessões abertas/fechadas/transferidas, waiter atribuído/reatribuído/removido, turnos, pedidos criados/mudados, pedidos de mesa, chamados, pagamentos, planta, disponibilidade e dia operacional. O Serviço chama novamente catálogo, operações, aprovações, mesas fallback e disponibilidade; não será criado polling ou socket paralelo.
- A conexão possui estados atuais (`connecting`, `connected`, `reconnecting`, `disconnected`, `unavailable`, `error`), fallback/reconciliação e refresh manual. Chamados globais de pedidos prontos já são tratados no shell; a tela não duplicará notificação global.
- Operações preserva snapshot no refresh em background e mostra erro somente em primeira carga/context switch. Aprovações, fallback, disponibilidade e resumo pessoal têm loading/erro próprios. O drawer mantém feedback inline de sucesso/erro; Serviço ainda não usa `useSnackbar`.
- Loading atual usa spinner; listas vazias usam `EmptyState`. A migração pode tornar as formas de loading/vazio compactas sem alterar a fonte de dados ou apagar conteúdo válido em refresh.

### Responsividade e permissões atuais

- O shell legado e o Shell V2 envolvem a tela; o V2 está atrás de `VITE_SHELL_V2`. A tela em si não adapta navegação/densidade de acordo com largura: cabeçalho e seções são verticais, mesas são linhas e o drawer muda de inferior para painel lateral em 640 px.
- Os gates acima derivam de `usePermissions()` e das permissões atuais. Não são usados nomes de role. `canViewTables` combina `view_operations`, `record_payments`, `close_bill` e `handle_table_requests` somente para escolher entre o snapshot autorizado e o fallback já auditado.
- O restaurante ativo reseta mesa/pedido selecionados; o deep link existente `?restaurant=&table=` espera as mesas carregarem, abre a mesa correspondente e consome o parâmetro.

## Mudanças da Fase 4B

### Arquitetura e fluxo

- Serviço agora abre com `APageHeader`, estado de conexão e faixa compacta “Agora”; as mesas vêm em seguida numa grade operacional. Disponibilidade e avaliações permanecem acessíveis depois da área de mesas. As avaliações pessoais ficam em disclosure recolhido; nenhum dado ou endpoint foi removido.
- A faixa reúne a fila real `waiting_approval` e alertas `operations/live`. Aprovar continua ação direta de um toque pela fila já autorizada; pedidos que pedem detalhe abrem `OrderDetailSheet`. Alertas com mesa abrem o detalhe da mesa na seção existente que corresponde ao tipo (`orders`, `requests`, `bill` ou visão geral). Alertas sem `table_id` permanecem visíveis na faixa, sem ação inventada: o snapshot não fornece mesa/destino nem uma ação de resolução para esses itens.
- Alertas `order_waiting_approval` são omitidos da faixa quando a fila de aprovação já está visível, para não duplicar o mesmo sinal. Sem permissão para aprovar, o alerta agregado existente ainda pode aparecer. Não foi criada ordenação temporal nem prioridade além da ordem atual: pedidos primeiro, depois ordem recebida dos alertas do backend.
- A lista operacional mantém a ordenação anterior das mesas (contas/chamados, pedidos prontos, aprovação/preparo, demais ocupadas e livres; empate pelo nome). Nenhum threshold/SLA foi adicionado.

### Mesa, filtros e detalhe

- Criado `ServiceTableTile.vue`: tile inteiro tocável, status visível com texto + ícone + peso, número de pessoas e tempo quando existem na sessão, waiter atribuído quando disponível e contagem real de aprovações. O mapper `service-table-status.ts` usa exclusivamente os sete valores `primary_status` existentes. `preparing` e `occupied` continuam estados normais; a atenção é reservada ao que já pede ação.
- A grade é de 2 colunas em mobile, 3 a partir de 414 px, 4 em tablet e cresce no desktop. Mantém quebra de texto, alvos amplos e leitura vertical. Não há mapa novo.
- `Todas / Mis mesas` só aparece com snapshot de operações e identidade autenticada disponível; compara `assigned_waiter.id` com `authContext.user.id`. O fallback de mesas, que não tem waiter, nunca aplica filtro parcial. O seletor de zona só aparece com mais de uma zona existente no snapshot. Mesas sem zona continuam em “Todas”.
- Serviço opta pela apresentação modal de `ASheet`: bottom responsivo em mobile, tela completa em compact, side modal em tablet/desktop, conteúdo rolável e footer fixo com safe-area. Escape, scrim, foco, retorno de foco, scroll lock, teclado virtual e reduced-motion vêm do primitivo compartilhado. A seção inicial acompanha o alerta que abriu a mesa.
- O footer usa apenas ações atuais e respeita a permissão já existente: abrir mesa, ir a pedidos, ir a solicitações, ver conta ou criar pedido. Se não houver uma ação única segura suportada pelos dados/permissões disponíveis, não inventa uma. Cobrar e fechar permanecem no fluxo existente, dependem do servidor e da confirmação/`can_close` autoritativa.
- O `TableDetailsDrawer` permanece compatível com o Dashboard por padrão: as props opcionais `serviceMode` e `initialSection` habilitam a nova apresentação apenas em Serviço. `TableOrdersList` e `TableRequestsPanel` aceitam também uma prop opcional de feedback, sem mudar o comportamento do Dashboard. A transferência agora usa `ADialog`; por ser o mesmo fluxo compartilhado, sua camada visual modal também passa a ser comum ao detalhe de mesa do Dashboard.
- Ações raras de atribuir, transferir, recibo, acesso, chamada própria e edição seguem nos controles existentes e mantêm seus gates. Nenhuma permissão ou chamada de serviço foi introduzida.

### Realtime, feedback e estados

- `useRestaurantRealtime` e seus eventos não foram modificados nesta fase. Não foi criado polling, socket ou notificação paralelos. Eventos invalidam as mesmas leituras REST existentes; chamadas globais de pedido pronto continuam no shell.
- `ASnackbar` confirma sucesso de aprovação/rejeição, disponibilidade, atendimento/conclusão de solicitações e ações de mesa/pedido somente depois da resposta de sucesso. Erros mantêm mensagem textual próxima do fluxo. Não há Undo novo nem otimização de ações financeiras.
- Skeletons substituem o spinner em primeira carga da fila Agora, mesas e avaliações. Erro de refresh preserva conteúdo carregado quando a fonte atual já o faz; estado vazio de mesa/filtro e “Todo en orden” são compactos.

### Breakpoints, temas e acessibilidade

| Classe/tamanho | Comportamento estrutural revisado |
| --- | --- |
| 375 px / mobile landscape | Faixa “Agora” horizontal com snap; grade 2 colunas; drawer de mesa full-screen com footer e safe-area |
| 414 px | Grade passa a 3 colunas com texto quebrável e tile que cresce conforme o conteúdo |
| 768 px / tablet portrait | Grade 4 colunas; detalhe em side sheet modal e scroll interno |
| 1024 px landscape | Densidade de tablet mantida, sem layout de mapa novo; side sheet mantém contexto da grade |
| 1280/1440 px | Grade amplia a densidade; detalhe lateral de até a largura de token do `ASheet`; controles de zona/escopo permanecem disponíveis |

- Revisados estruturalmente targets >=48 px em tiles/controles de filtro e >=52 px no CTA principal do sheet; as opções do escopo também têm 44 px. Controles continuam operáveis sem hover, há foco visível e nomes/textos completos continuam no DOM para leitores de tela.
- Status não depende de cor; números usam `tabular-nums`; foco e conteúdo do modal usam primitivas compartilhadas. Safe-area do sheet fica no overlay e não é repetida no conteúdo da tela. Teclado e movimento reduzido usam a infraestrutura do overlay.
- Strings novas foram adicionadas a `es-ES`, `ca-ES-valencia` e `en-GB`. Não foi adicionado locale nem conteúdo de interface em português. Sem hex novos; o mapper e a tela usam tokens semânticos existentes. O layout considera 200% por CSS estrutural, mas não foi observado em browser por causa do bloqueio abaixo.
- A apresentação antiga do detalhe continua para o shell legado e o Dashboard; em `VITE_SHELL_V2=true`, Serviço usa o mesmo layout e sheet sem alteração de rotas/shell.

## Testes e builds

- `npm run build` — passou.
- `VITE_SHELL_V2=true npm run build` — passou; não altera o default do flag.
- `node tests/frontend-service.mjs` — passou: mapper dos status, conteúdo/alvo do tile, faixa e filtros, apresentação isolada, transferência modal, contrato realtime e strings dos três locales.
- `node tests/frontend-shell.mjs` — passou (29 verificações de permissão/navegação e estrutura de breakpoint/safe-area/teclado/targets).
- `node tests/frontend-primitives.mjs` — passou (93 verificações montadas de primitivos/foco/snackbar).
- `node tests/frontend-primitives-responsive.mjs` — passou (54 cenários estruturais de viewport, pointer e zoom até 200%).
- `node tests/frontend-design-tokens.mjs` — passou (cores/pares WCAG/utilities e compatibilidade legada).
- `npm run test:hardening` — passou (115 verificações e 20 builds seguros/fail-fast; apareceu aviso de que a porta HMR 24678 já estava em uso durante execução paralela, sem falha de suite).
- `npm run test:security` — passou (54 verificações adversariais).
- `node tests/frontend-approvals.mjs`, `node tests/frontend-realtime.mjs`, `node tests/frontend-availability.mjs`, `node tests/frontend-session-history.mjs` e `node tests/frontend-assignment.mjs` foram tentados. Chrome encerrou com `libnspr4.so` ausente antes de iniciar os testes montados. As três últimas suites foram reexecutadas com permissão para o servidor local; o bloqueio de Chrome persistiu. Nenhuma dependência de sistema foi instalada.
- Não há script de lint no `package.json`.

## Revisão, riscos e dívida para Fase 4C

- Corrigidos: ordem vertical que colocava avaliações/disponibilidade antes das mesas, lista de mesa sem densidade móvel, chamadas/agregados sem faixa de prioridade, detalhe não-modal no caminho principal, controles em detalhe sem footer persistente, transferência com `z-[60]` próprio e falta de snackbar em sucessos do Serviço.
- APIs/backend, stores, auth, rotas, permissões, status e regras financeiras permaneceram intactos. As novas props de apresentação são aditivas e opcionais em componentes Vue compartilhados; uso legado do Dashboard fica no valor padrão. O componente visual `AStatusBadge` não conhece tipos de domínio.
- Status inventados: nenhum. Thresholds, SLA ou regra de atraso inventados: nenhum. O fallback limitado de mesas segue sem assignee, alertas, pedidos e billing que a resposta não fornece.
- Risco/limitação: alertas sem mesa não têm uma ação de destino segura no contrato atual; são apresentados com tipo, pessoa (se fornecida em `staff`) e tempo, sem botão falso. A CTA “Ver pedidos/solicitações/conta” desloca o scroll à área real, enquanto a ação de domínio continua dentro do componente que já detém a mutation.
- O `TransferTableDialog` é compartilhado e agora usa `ADialog` também quando aberto pelo Dashboard. O conteúdo de domínio do Dashboard não mudou; a mudança é restrita ao primitivo modal de transferência de mesa.
- **Validação visual real está pendente:** agent-browser não consegue iniciar o Chrome neste ambiente por `libnspr4.so`; portanto não há screenshot, teste real de orientação/teclado ou observação pixel a pixel. A estrutura CSS/build/tests cobre 375/414, 768, 1024 landscape, 1280/1440 e 200% estruturalmente, mas ainda precisa conferência em browser/dispositivo, Light/Dark e nos três locales, inclusive side sheet e safe-area.
- Para a fase posterior, ficam a inspeção visual com browser/dispositivo real; testar leitor de tela e foco inicial/foco de retorno em fluxos compostos de mesa → sub-sheet; validar se alertas sem mesa ganham destino/ação em contrato futuro; e decidir se separações de “Pedidos / Cuenta / Mesa” justificam tabs depois de observar o fluxo real. Não iniciar esses itens nesta fase.
