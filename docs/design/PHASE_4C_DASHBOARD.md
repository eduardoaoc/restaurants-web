# Fase 4C — Dashboard

> Auditoria do estado anterior, registrada antes de alterar a interface. Referência visual: `DESIGN_SYSTEM.md`. A marca do produto não está definida; este relatório usa “produto”.

## Auditoria anterior à implementação

### Arquitetura anterior

- `DashboardView.vue` mantinha duas abas: Operação e Análise. Operação usava `DashboardPageHead`, um `DailyOperationBanner`, `QuickActions`, `QuickMetrics`, `AttentionPanel`, mapa, cozinha, equipe e capacidade. Análise era carregada sob demanda e apresentava métricas e gráficos.
- `DashboardPageHead` mostrava título como `h2`, score de saúde com anel, contexto do gargalo, conexão realtime e as abas. O score e a contagem derivam de `operations/live`.
- Operação usava `MetricCard` e `SectionCard` sobre `ASurface` elevado, repetindo containers independentes e colocando a lista detalhada de alertas antes/ao lado do mapa em mobile.
- `RestaurantFloorMap` é um visualizador selecionável do salão com filtros de piso/zona e `FloorTableMarker` em posição percentual, porém com dimensões fixas em px. O editor de planta é separado (`FloorMapEditor`) e só é aberto por usuário com `manage_floor_plan`.
- `ActivityPanel` é aberto pelo shell/centro de atividade, não montado dentro do Dashboard. `ReadyOrderNotificationStack` também é integração global do shell.

### Fontes e dados confirmados no frontend

| Fonte | Conteúdo usado | Atualização e limites |
|---|---|---|
| `GET /restaurants/{id}/operations/live` via `useRestaurantOperations` | Snapshot operacional: restaurante/moeda/fuso, resumo de mesas e ocupação, sessões/clientes, pedidos ativos e por estados, equipe ativa, solicitações, pagamentos recebidos hoje, operação diária, saúde/gargalo, pisos/zonas/mesas, staff em turno, cozinha e alertas tipados | `view_operations`; troca de restaurante aborta e limpa snapshot anterior. `refetch` mantém conteúdo existente. Realtime invalida e busca novamente; não há cálculo local de regras operacionais. |
| `useRestaurantRealtime` | Estado de conexão, último evento e refresh coalescido do snapshot | Subscription existente em `restaurant.{id}`; eventos invalidam REST. Mantém fallback/reconciliação próprios. Não será criada subscription/polling nova. |
| `GET /restaurants/{id}/analytics` via `useRestaurantAnalytics` | Receita, ticket médio, pagamentos/sessões, pedidos, ocupação, duração de sessão, rotação, horas de pico, produtos, cozinha e staff no período | Gate `view_reports`; lazy ao abrir Análise. Valores monetários são strings decimais e passam por `Intl`; contrato não fornece deltas temporais. A falha atual zera `data`. |
| `GET /restaurants/{id}/kitchen/dashboard` via `useKitchenDashboard` | Read model distinto com histórico/métricas da cozinha | Não usado diretamente no Dashboard. O snapshot `operations/live` já expõe o resumo atual de cozinha. Não introduzir busca adicional. |
| `dashboard.service.ts` / `RestaurantDashboard` | Read model de faturamento, pedidos, sessões, pagamentos, solicitações e staff do período | Serviço/type existem, mas não são usados pelo `DashboardView`/`AnalyticsView` atual. Não será introduzida chamada nesta fase. |

O contrato `OperationsSummary` fornece mesas total/livres/ocupadas e `occupancy_rate` já arredondada pelo backend, sessões/clientes ativos, pedidos ativos/pendentes/preparo/prontos, equipe ativa, solicitações pendentes, `received_today` e pagamentos da operação. A cozinha ao vivo fornece contagem por `waiting_approval`, `confirmed`, `accepted`, `preparing`, `ready`, total ativo e idade do pedido ativo mais antigo. Staff inclui nome, turno/tempo, mesas/clientes atribuídos e pendências por pessoa. Alertas reais incluem `active_table_unassigned`, `assigned_waiter_off_shift`, `assigned_waiter_suspended`, `customer_waiter_request_pending`, `bill_request_pending`, `responsible_waiter_call_pending`, `order_waiting_approval` e `order_ready`, com severidade do servidor, mesa opcional, pessoa opcional e idade.

O mapa usa os mesmos objetos `OperationsTable` do snapshot, sem segundo modelo: sete estados reais (`free`, `occupied`, `waiting_approval`, `preparing`, `ready`, `waiter_requested`, `bill_requested`), flags, sessão, capacidade, pedidos, cobrança e layout. Capacidade agregada atual é calculada apenas para apresentação somando capacidades existentes; não é métrica backend nem regra operacional.

### Permissões e destinos existentes

- Dashboard é acessível com `view_operations` ou `view_reports`; os composables não fazem requisição quando o gate correspondente está fechado.
- Operação e mapa dependem de `view_operations`. Editar planta depende de `manage_floor_plan`.
- Análise usa `view_reports`. Staff usa `manage_users`; a cozinha é acessível no shell/rota com `update_kitchen_status` ou `serve_orders`; Serviço deriva seu acesso de `SERVICE_ACCESS_PERMISSIONS`.
- Fechamento diário continua com os gates existentes `open_daily_operation` / `close_daily_operation`; resumo/histórico tem outros gates na tela própria.
- Rotas existentes incluem `app-service`, `app-kitchen`, `app-staff`, `app-day-close` e `app-tables`. O Dashboard não criará destinos ou deep links.
- O snapshot operacional contém valores financeiros. A interface anterior os apresentava junto das métricas operacionais sem gate financeiro local; para cumprir a privacidade solicitada nesta fase, valores financeiros no Dashboard serão condicionados a `view_reports`, já usado pelo produto para relatórios. Nenhum permission slug será criado ou alterado.

### Duplicação e decisões antes da edição

- `AttentionPanel` expunha toda a fila de alertas e ação “Ver mesa”, conteúdo operacional detalhado que compete com Serviço. Dashboard deve resumir contagem e o gargalo real, deixando resolução no Serviço.
- `QuickMetrics` repetia ocupação, pedidos ativos e atenção; além disso, mostrava pagamento operacional. A nova hierarquia usará um `AStatStrip` único com apenas métricas verdadeiras e sem contagem duplicada da área Agora.
- Mapa é fonte de contexto visual e continua principal depois do resumo Agora. Em compact, a planta com dimensões absolutas fixas será substituída por representação em grade/lista com os mesmos dados; em larguras adequadas, o mapa atual permanece como visualizador. `FloorMapEditor` não será redesenhado.
- Cozinha e equipe são resumos compactos, sujeitos aos mesmos gates existentes das rotas correspondentes; CTA aponta para rotas atuais.
- Análise permanece secundária e lazy, preservando filtros/queries, dados e gráficos atuais; nenhuma comparação temporal será fabricada. O redesenho desta área será de hierarquia/superfícies quando necessário, sem biblioteca de gráficos nova.
- Daily operation e fluxo financeiro permanecem no destino existente. Estado normal não deve competir com mapa/atenção; estado excepcional continua visível e a ação só aparece sob os gates atuais.

Nenhum componente, contrato, rota, dado ou lógica de domínio foi alterado até este ponto da auditoria.

## Implementação da Fase 4C

### Arquitetura e hierarquia

- `DashboardView` preserva as abas Operação/Análise, o carregamento lazy de Analytics, o gate da rota e os composables existentes. O header agora usa `APageHeader` e é o único `h1`; título, realtime, refresh autorizado e tabs ficam organizados sem repetir a topbar.
- Operação segue: estado Agora → resumo operacional → sala/mesas → cozinha/equipe → capacidade recolhida → estado da operação diária. O banner diário aparece antes da sala quando a operação está fechada; em estado normal permanece abaixo do conteúdo operacional.
- Análise continua como contexto de período numa aba própria, sem copiar dados para Operação. Filtros, métricas disponíveis e gráficos existentes foram preservados, com estrutura de leitura e alternativa textual para dados de gráfico.
- `AStatStrip` é um `dl` responsivo com hairlines e valores alinhados; não cria cartões/KPIs por item. Não há novos valores calculados além da formatação de dados já enviados. Ocupação usa `occupancy_rate` do servidor.

### Agora e navegação

- `DashboardNow` resume a contagem e os tipos/severidade recebidos pelo endpoint, mantém visíveis o nível e o score de saúde do backend com rótulo explícito, mostra o gargalo já fornecido e apresenta “em ordem” sem painel grande quando não há alertas. Não replica itens acionáveis nem implementa ordem ou urgência novas.
- O link para Serviço é exibido somente com uma permissão existente de acesso à área. Cozinha e equipe aparecem somente com os gates atuais das respectivas rotas, e apontam para `app-kitchen` e `app-staff`. Não foram criadas rotas.
- O resumo financeiro `received_today` é ocultado sem `view_reports`; nenhum permission slug mudou. Analytics permanece gated por `view_reports`.

### Sala, mapa e detalhe

- Em compact, `DashboardTableOverview` substitui a planta absoluta por uma grade de duas colunas que usa diretamente as mesmas `OperationsTable`; a partir do breakpoint `sm` pode mostrar três colunas. Cada tile oferece pelo menos 48px de altura, nome, estado textual com badge semântico, e dados disponíveis de sessão/tempo.
- Em telas maiores, `RestaurantFloorMap` continua sendo o visualizador existente; não houve alteração do editor de planta ou de seu modelo. Os marcadores ficaram tocáveis e o mapa usa o mapper semântico compartilhado de estados de mesa.
- O drawer de detalhe do mapa passou a optar por `ASheet` através da prop interna `dashboardMode`, mantendo conteúdo, permissões, ações, requests e eventos existentes. O modo Serviço continua usando seu `ASheet` e fluxo próprios. Nenhuma action de domínio foi adicionada. O status de mesa usa `AStatusBadge` via mapper, sem mover conhecimento de backend para o primitivo.

### Cozinha, equipe e capacidade

- Cozinha é resumo de contagens, ativos e idade mais antiga já presente em `operations/live`; não chama o read model separado, não se torna mini-KDS e só aparece sob o gate de rota atual.
- Equipe mostra até quatro primeiras entradas na ordem do servidor, usando somente nome/carga/mesa já disponíveis. Não há ranking, score ou produtividade derivada.
- Capacidade continua sendo soma de capacidades existentes, agora em disclosure secundário; não vira KPI principal nem regra de alerta.

### Operação diária, loading, falhas e realtime

- Estado normal diário fica discreto no fim; estado `not_open` permanece visível antes do mapa com ação controlada pelos gates existentes. Fechamento continua no fluxo dedicado.
- Primeira carga usa esqueletos por área e texto acessível; refresh mantém conteúdo através dos composables. Analytics também tem skeleton sem remover filtros nem dados de domínio.
- Realtime permanece ligado a `useRestaurantRealtime`/`useRestaurantOperations`; não há polling ou subscription nova. O refresh manual continua apenas no contexto permitido.
- A leitura operacional e Analytics continuam em composables separados. A arquitetura atual de Analytics limpa dados quando a chamada falha; essa limitação preexistente não foi alterada nesta migração.

### Responsividade e acessibilidade

| Viewport | Estrutura CSS prevista e verificada estruturalmente |
|---|---|
| 375 px | Ordem vertical mobile-first, resumo compacto, strip em duas colunas, mesas em duas colunas; detalhe usa ASheet. |
| 414 px | Duas colunas nas métricas e duas colunas para mesas (a terceira coluna só a partir de `sm`, ver revisão abaixo), com targets tocáveis. |
| 768 px | Composição ganha densidade; grade de mesas em três colunas e shell tablet existente. |
| 1024 px landscape | Mapa completo e área de operação em composição de tablet/gestão; cozinha/equipe secundárias. |
| 1280 px | Mapa e contexto em composição assimétrica, com largura mínima protegida. |
| 1440 px | Mesma hierarquia, usando espaço extra sem expandir cards em uma linha de KPIs. |

- Navegação de tabs usa botões nativos com `aria-pressed`, nomes localizados e targets de pelo menos 44px. Mapa compacto tem tiles completos tocáveis. Headings semânticos, badge com ícone e texto, alternativas expansíveis para gráficos e estados de loading anunciados foram preservados/adicionados.
- Cores, superfícies, foco, tipografia e hairlines usam tokens existentes. Não foram adicionados hex nem escala de elevação; Light/Dark herdam a paleta SALOA V2. Respeito a `prefers-reduced-motion` mantém-se nos primitivos/shell e esqueletos têm movimento reduzido desativável.
- 200% zoom, keyboard, landscape, safe-area e ausência de clipping foram revisados por CSS/estrutura e pelos contratos de responsividade existentes; não houve browser visual disponível para atestar geometria real.

### Testes e builds

- Adicionado `tests/frontend-dashboard.mjs`: hierarquia, gates, faixa Agora, strip, grid/mapa, privacidade financeira, cozinha/equipe, links, breakpoints estruturais, temas e locales.
- Atualizado o contrato estrutural de `tests/frontend-service.mjs` para permitir que o drawer compartilhado use `ASheet` tanto no Serviço quanto no Dashboard; a apresentação Service permanece opt-in e seu teste passou.
- Passaram: `npm run build`; `VITE_SHELL_V2=true npm run build`; testes Dashboard, Service, Kitchen, Shell, Primitives, responsividade, Design Tokens, Hardening e Security.
- `npm run lint` não existe no `package.json`.
- O teste browser de realtime não completou: Chrome encerra antes de abrir porque falta `libnspr4.so`. Também não foi possível validar screenshot/DOM por browser; nenhuma dependência foi instalada. A suíte browser de operações diárias teve a mesma limitação. Não declarar pixel-perfect nem aprovação visual.
- Retomada (2026-10-27): após instalar as bibliotecas do Chrome no WSL, `npx agent-browser open about:blank` iniciou o navegador com sucesso (agent-browser 0.36.0); a falta de `libnspr4.so` está resolvida. A validação visual continua bloqueada: frontend (`:5174`, `strictPort` no `vite.config.ts`) e API (`:8080`, `VITE_API_URL`) não estavam em execução, e a API é servida via Docker (`restaurants-api/compose.yaml`), indisponível nesta distro WSL — erro: `The command 'docker' could not be found in this WSL 2 distro. We recommend to activate the WSL integration in Docker Desktop settings.` Sem API não há login nem `operations/live`; nenhum teste browser, screenshot, tema, viewport, teclado ou zoom de 200% foi executado. Testes manuais pendentes permanecem pendentes.
- `git diff --check` reporta CR no fim de linhas novas dos três locales; os arquivos do repositório já são CRLF. As terminações foram preservadas para evitar converter os arquivos inteiros e criar diff de linha-ending sem conteúdo.

### Escopo, regressões e riscos

- Arquivos alterados nesta fase: `DashboardPageHead.vue`, `DashboardTabs.vue`, gráficos `PeakHoursChart.vue`/`RevenueChart.vue`, painéis `CapacityPanel.vue`, `FloorTableMarker.vue`, `KitchenLivePanel.vue`, `RestaurantFloorMap.vue`, `StaffLivePanel.vue`, `TableDetailsDrawer.vue`; novos `AStatStrip.vue`, `DashboardNow.vue`, `DashboardTableOverview.vue`; `DashboardView.vue`, `OperationView.vue`, `AnalyticsView.vue`, `style.css`, os três locales e `tests/frontend-dashboard.mjs`; `tests/frontend-service.mjs` teve apenas sua expectativa estrutural atualizada. Este documento completa o relatório.
- Sem regressões de build ou testes estruturais do Dashboard/Service/Kitchen/Shell/Primitives. Nenhuma API pública de backend, endpoint, store, autenticação, permission slug, rota, estado de domínio ou contrato mudou. Há novas props internas `canViewReports` em `OperationView` e `dashboardMode` no drawer compartilhado.
- Sem KPI, status, threshold, SLA, comparação temporal, score ou dado inventado. `received_today` é dado existente e sua apresentação usa o gate financeiro existente `view_reports`.
- A modificação compartilhada do detalhe é restrita à apresentação modal do Dashboard e ao uso do mapper visual; é risco para validação visual do Serviço, coberto pelo teste estrutural existente, mas ainda requer inspeção real no browser.
- Nenhuma página de Serviço/KDS/Staff/Settings/Menu/Floor Map editor foi migrada. Analytics foi reorganizada apenas como a aba de desempenho do próprio Dashboard.

## Revisão visual após reprovação (2026-10-27)

> A aprovação visual foi pausada pelo responsável: o Dashboard da implementação acima foi considerado pior que o anterior. Esta seção registra a comparação com o `HEAD`, as causas, as correções e o que foi de fato verificado em browser. O que está acima continua como histórico da implementação; onde houver divergência, vale esta seção.

### Método de comparação

- Versão anterior: `git archive HEAD` extraído fora do repositório e servido em `:5175` por um Vite temporário com proxy para a API (mesma sessão Sanctum, Reverb não configurado nessa cópia). Nenhum arquivo do repositório, `.env` ou backend foi alterado para isso.
- Versão atual: `:5174`, Reverb `:8081` e worker `realtime-local` ativos (indicador "Tiempo real conectado").
- Capturas com `agent-browser` 0.36.0 no mesmo restaurante (AFORO Malvarrosa, id 1), mesmo tema e mesma largura. Estilos confirmados no DOM: tokens SALOA V2 resolvidos em claro/escuro (`--color-surface`, `--color-accent`, `--duration-fast` etc.), utilitários Tailwind gerados para todas as classes usadas, `focus-visible:outline-focus` presente. Fonte: `ui-sans-serif, system-ui` (no WSL renderiza DejaVu, mais larga que a SF do iOS; é a pilha provisória documentada, não foi trocada).
- A skill `/ui-ux-pro-max` exigida pelo `CLAUDE.md` não estava disponível nesta sessão; as decisões seguiram `DESIGN_SYSTEM.md` (§3.5, §5, §10, §16, §21, §24.2).

### Causas da regressão (implementação anterior desta fase)

1. **Mesas sem estado visual.** `FloorTableMarker` aplicava `border-control bg-surface text-fg` a todos os estados; `attention` mudava só o ícone. Livre, ocupada e "esperando aprovação" ficavam iguais, contrariando §21.2 (livre = contorno sem fill; atenção = `primary-subtle` + `primary-text`).
2. **Planta sem plano.** O canvas virou `bg-background`, a mesma cor da página, e as zonas perderam o container: as mesas "flutuavam" com grandes vazios e os cabeçalhos das zonas desalinhavam (`first:border-t-0 first:pt-0`).
3. **Proporção de colunas.** Grade `xl:[2fr_1fr]` deixava cada zona com ~410 px em 1440; com posições percentuais e tamanhos em px, Mesa 03/04, 07/08 e 11/12 se sobrepunham, e a coluna lateral terminava muito antes do mapa.
4. **Excesso de laranja.** Aba ativa com texto `accent` + check, chip de planta ativo em `primary-subtle`/`accent`, três links "Ver …" em `accent`, ícone de atenção do resumo e ícones da legenda — além do CTA "Abrir el día". §3.5 limita a 1 primary por região + seleção ativa + itens em atenção.
5. **Textos e indicadores apertados.** Resumo "Agora" com ícone, título, badge, índice e texto em linhas comprimidas e o link de Serviço isolado à direita; badge de realtime solto entre título e ações; cozinha em grade 3×2 com sublinhados e células vazias; tempo da equipe sem rótulo.
6. **Mobile.** Tiles com `min-h-28` e `justify-between` criavam vãos; em 414 px a terceira coluna quebrava "Esperando aprobación" no meio da palavra; o tile omitia `guest_count` quando era 0, divergindo do mapa.

### Correções visuais aplicadas

- **Layout:** o mapa ocupa a largura útil; Cozinha e Equipe ficam abaixo em duas colunas iguais (`lg:grid-cols-2`); capacidade virou disclosure do próprio mapa. Espaço entre seções 32 px; grupo superior (Agora, aviso diário, métricas) 16 px. Zonas lado a lado só a partir de `xl` (1280); em 1024 empilham, preservando a geometria do editor.
- **Planta:** cada zona é um Panel (`surface`, hairline, `radius-lg`) com cabeçalho e um plano rebaixado `surface-subtle` onde as mesas (objetos raised) ficam. Sem gradiente, grade decorativa ou sombra interna.
- **Mesas:** novo helper local `floor-table-tone.ts` (só apresentação, sobre o mapper compartilhado): livre = contorno `border-control` sem fill; ocupada/em cozinha = `surface` raised; atenção = `primary-subtle` + `primary-text` + ícone `fill`. Nome em `text-label-lg` 600 sem quebra; tempo e clientes em `tabular-nums`; o tile cresce (`min-w-max`) em vez de cortar. Seleção = anel `accent` com offset; hover só cor (§10.2). A legenda repete o mesmo tratamento em miniatura com rótulo sempre visível.
- **Laranja:** segmented Operação/Análise e seletor de planta neutros (trilho `surface-subtle`, thumb `surface` raised, ativo `text-fg` 600, sem check). "Ver servicio" virou botão secondary pequeno; "Ver cocina"/"Ver equipo" ghost pequenos com chevron. Laranja restante: CTA "Abrir el día", estado de atenção das mesas/legenda, foco e o badge do estado de atenção.
- **Cabeçalho e Agora:** realtime passou para a linha de subtítulo do `APageHeader`; "Actualizar" e "Editar mapa" em tamanho `sm` (alvo de 44 px mantido pelo primitivo). Agora = título + badge de saúde + contagem numa linha; causa principal (`operations.health.bottleneckPrefix`) e índice operativo numa segunda linha muted.
- **Cozinha:** Panel com par de métricas (pedidos ativos | mais antigo ativo) e lista de estados em linhas com contagem alinhada à direita; zero fica muted. Reutiliza `kitchen.dashboard.activeOrders/oldestActive`.
- **Equipe:** Panel em linhas com iniciais neutras, nome, carga e tempo à direita com o rótulo existente `staff.shift.onShift` ("En turno").
- **Métricas:** `AStatStrip` com `radius-lg` e respiro vertical de 16 px em `md+`; alinhamento da segunda linha mobile corrigido.
- **Mobile:** tiles com altura mínima de 80 px, conteúdo do topo para baixo, mesmo tratamento por estado do mapa; terceira coluna só a partir de `sm` (640 px); clientes exibidos sempre que há sessão.
- **Movimento:** entrada única do conteúdo (opacity + 4 px, 200 ms, `ease-out`) apenas com `prefers-reduced-motion: no-preference`; cross-fade de cor de 150 ms nos estados; nenhuma animação em loop.
- Nenhuma regra, permissão, contrato, rota, composable ou backend mudou. Nenhuma chave de locale nova. `tests/frontend-dashboard.mjs` teve duas expectativas atualizadas para o novo layout (mapa em largura total; terceira coluna em `sm`) e a mensagem de teste `bottleneckPrefix`.

### Tempos extremos (investigação separada)

- Valores lidos diretamente de `GET /operations/live` (somente leitura): `generated_at` 2026-10-27T20:23Z coerente com o relógio; turnos com `shift_started_at` 2026-09-16 e `active_seconds` ≈ 3,6 M s (~1001 h); sessão da Mesa 11 iniciada em 2026-10-21 (564 737 s ≈ 156 h); chamados ao responsável pendentes há até 3 583 090 s (~995 h); pedido ativo mais antigo 564 669 s; dia operacional `not_open`.
- A versão anterior exibe os mesmos números: **não é regressão nem cálculo do frontend**. A causa é o estado dos dados de teste (turnos nunca encerrados, sessão/pedidos e chamados abertos há dias com o dia fechado). `formatDuration` apenas formata em horas.
- Nada foi ocultado, truncado ou limitado e nenhum limiar foi inventado. Possíveis próximos passos, fora deste escopo e sujeitos a decisão: formato com dias para durações longas (mudança de apresentação compartilhada) e/ou contrato de escalonamento por tempo no backend (§21.2 [contrato]); revisar os dados de teste/turnos abertos com o responsável.

### Resultados verificados em browser (2026-10-27)

- **Desktop primeiro:** 1440 claro/escuro, 1280 escuro, 1024 landscape claro/escuro — mapa sem sobreposição, colunas proporcionais, sem vazios estruturais. Capturas inspecionadas antes da adaptação mobile.
- **Mobile/tablet:** 375 claro/escuro, 414 claro, 768 escuro — grade legível, sem quebra no meio de palavras após a correção; "Ver servicio" não comprime em 768 (`shrink-0`).
- **Zoom 200% (equivalente de reflow):** 720×450 e 640×400 CSS px (1440 e 1280 a 200%) — conteúdo reflui para o layout compacto, sem overflow. Zoom de página nativo do navegador não foi acionado; a verificação é por largura equivalente.
- **Overflow horizontal:** `scrollWidth = clientWidth` em 375, 414, 768, 1024, 1280, 1440, 720 e 640; nenhum elemento além da borda.
- **Teclado:** ordem de Tab segue a hierarquia (skip link → navegação → topbar → Actualizar → Operação/Análise → Ver servicio → Abrir el día → Editar mapa → plantas → mesas na ordem do servidor → Capacidade → Ver cocina → Ver equipo); foco visível (outline 2 px) no marcador; Enter abre o detalhe modal (`aria-modal`, foco dentro); Esc fecha e devolve o foco à mesa.
- **Detalhe compartilhado:** no Dashboard abre como sheet lateral com todas as ações existentes; no Serviço (375 escuro) abre igual à versão anterior.
- **Análise:** aba renderiza com segmented neutro e dados de período.
- **Console/erros:** nenhum erro de runtime registrado nas páginas validadas.
- **Builds/testes:** `npm run build` e `VITE_SHELL_V2=true npm run build` verdes; `frontend-dashboard`, `service`, `kitchen`, `shell`, `primitives`, `primitives-responsive`, `design-tokens`, `hardening`, `hardening-build`, `security` passaram; `frontend-realtime.mjs` (browser, dublês locais) passou com 38 checagens e sem erros de browser.
- **Ambiente preservado:** fila `default` permaneceu em 284 e `failed_jobs` em 1; `realtime-local` drenada pelo worker; nenhuma ação operacional (aprovar, abrir dia, atribuir) foi executada.

### Pendências e próxima fase

- **Aprovação visual:** depende do responsável. As correções acima foram verificadas em browser, mas o Dashboard não está declarado aprovado nem pronto para produção.
- **Detalhe no Serviço (preexistente, Fase 4B):** em 375 px "Llamar al responsable" quebra no meio da palavra e "Pendiente de asignación" trunca; idêntico no `HEAD`, portanto não é regressão desta fase e não foi alterado aqui.
- **Detalhe no Dashboard:** vários botões primary "Aprobar" (um por pedido) e números de pedido em `accent` excedem o orçamento de laranja de §3.5; componente compartilhado com o Serviço, a revisar em fase própria.
- **Realtime ponta a ponta:** conexão Reverb verificada pelo indicador; nenhum evento foi provocado para não alterar dados operacionais.
- **Durações longas e escalonamento por tempo:** ver "Tempos extremos".
- **Dívida anterior mantida:** Analytics zera dados ao falhar; ergonomia da grade compacta com muitos nomes repetidos ("Mesa 15" ×5 vem dos dados).

### Histórico das pendências anteriores


- Dashboard está estruturalmente pronto para inspeção visual e validação operacional; não está declarado visualmente aprovado ou pronto para produção.
- Validar em browser/screenshot os viewports 375, 414, 768, 1024 landscape, 1280 e 1440, orientação, 200% zoom, tema claro/escuro, leitura de gráficos, detalhe modal no Dashboard e impacto do componente compartilhado no Serviço.
- Contrato permanece pendente para thresholds de urgência/atraso: nenhum foi inferido nesta fase. O resumo atual usa exclusivamente severidade/idade que já vêm do snapshot.
- Dívida futura: validar visualmente o comportamento parcial de falha de Analytics (o composable zera dados ao falhar) e melhorar isolamento de falhas se uma mudança compatível de estado/composable for aprovada em fase própria; avaliar ergonomia da tabela do mapa em tela compacta com dados reais extensos; executar browser realtime quando o runtime estiver disponível.
