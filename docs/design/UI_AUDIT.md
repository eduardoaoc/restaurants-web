# UI/UX Audit — restaurants-web

> **Escopo:** auditoria somente leitura de todo o frontend (Vue 3 + TS + Tailwind v4). Nenhum código foi alterado.
> **Data:** 2026-10-26 · **Base:** `main` @ `9ee3d46` + working tree atual.
> **Lentes usadas:** impeccable (audit), ui-ux-pro-max (UX de restaurante), frontend-design / taste (anti-template), apple-design (feedback, restrição, consistência espacial), `docs/design-system.md` e `CLAUDE.md` do projeto.

### Nota sobre o nome

O pedido fala em **"Saloa"**, mas o repositório, os assets (`src/assets/brand/aforo-*.png`), o `CLAUDE.md` e o design system são todos **AFORO**. Este relatório trata os dois nomes como o mesmo produto. Se "Saloa" for um rebrand, isso muda a recomendação final (§7): logo, wordmark e paleta amostrada hoje dos pixels reais da marca AFORO teriam que ser refeitos. **Isso precisa ser confirmado antes de qualquer implementação.**

### Limite desta auditoria

A validação visual com `agent-browser` **não rodou**. O Chrome for Testing falhou ao iniciar no WSL (`libnspr4.so: cannot open shared object file`), o que indica bibliotecas de sistema ausentes. Portanto tudo aqui vem de leitura de código, contagem de padrões, do detector do impeccable e de cálculos de contraste WCAG feitos sobre os tokens reais. Não há screenshots. Para habilitar a próxima rodada, rode `sudo npx agent-browser install --with-deps` (ou `sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2`).

---

## 1. Resumo executivo

| # | Dimensão | Nota | Achado principal |
|---|---|---|---|
| 1 | Acessibilidade | 2/4 | O laranja primário usado como **texto** no Light mode tem **2,58:1** (falha AA). Isso afeta 43 usos de `text-primary` e os botões `outlined`/`text`. |
| 2 | Performance | 3/4 | Sem problemas graves. `PublicTableView.vue` tem 1 249 linhas, e os blobs `blur-3xl` do login são caros, mas pontuais. |
| 3 | Responsivo | 2/4 | Não há navegação inferior no mobile, o rail tem 8 itens, há vários alvos abaixo de 44 px, o KDS mostra uma coluna por vez e o mapa de mesas usa px fixos. |
| 4 | Theming | 3/4 | O sistema de tokens é sólido e quase sem hex cru. Os degraus tonais é que são fracos: no Dark, container contra background dá **1,18:1**, e as bordas são quase invisíveis. |
| 5 | Integridade de implementação | 2/4 | O mesmo componente foi reimplementado várias vezes: 5 segmented controls, 4 dropdowns, 3 shells de modal, 6 empty states e ~10 caixas de erro inline. |
| **Total** | | **12/20** | **Aceitável.** A base é boa, mas o sistema "vazou" para dentro das telas. |

**Contagem:** P0 = 3 · P1 = 11 · P2 = 12 · P3 = 7

**Top 5**
1. **[P0]** O laranja como texto é ilegível no Light mode (links, botões `outlined`/`text`, ações secundárias).
2. **[P0]** O KDS não funciona como KDS: abre num dashboard de métricas e mostra um status por vez, em vez de colunas lado a lado em tablet.
3. **[P0]** O garçom no celular não tem navegação persistente. Tudo passa por hambúrguer → drawer, e o `TableDetailsDrawer` (onde ele mais trabalha) não é um diálogo modal de verdade.
4. **[P1]** Faltam primitivos: `ASegmented`, `AFilterChip`, `AMenu`, `ASelect`, `AAlert`/`AErrorState`, `ADialog` e `AEmptyState`. Cada tela reinventa o seu.
5. **[P1]** Profundidade e hierarquia estão achatadas: card dentro de card, todos com o mesmo tom, borda e sombra. É o look "dashboard SaaS genérico".

### Veredito de integridade

**Aprovado com ressalvas.** A *fundação* é específica do produto e coerente: tokens M3 em três camadas, paleta amostrada do logo real, status sempre com ícone e texto (nunca só cor), i18n disciplinado, `prefers-reduced-motion` respeitado e permissões vindas do backend. O que falha é a *camada de componentes*. Os primitivos `A*` cobrem só botão, campo, toggle, chip, superfície e sheet. Tudo acima disso é Tailwind inline, copiado e colado entre telas, com pequenas variações de raio, altura e estado. O resultado parece "correto, mas genérico", não uma identidade AFORO.

---

## 2. Inventário atual

### 2.1 Layouts
| Layout | Arquivo | Observação |
|---|---|---|
| App Shell | `src/layouts/AppShellLayout.vue` | Rail M3 de 80 px (md+), drawer modal no mobile e topbar de 64 px com título, restaurante, idioma, tema, sino e usuário. |
| Plataforma | `src/layouts/PlatformLayout.vue` | Só a topbar. Separado do shell, o que está correto. |
| Login / auth | `src/views/LoginView.vue`, `views/auth/*` | Split 60/40: foto com scrim e glow + formulário. |
| Público QR | `src/views/public/PublicTableView.vue` | Fora do shell, com reel/feed, sheets e intro animada. **1 249 linhas num só arquivo.** |

### 2.2 Páginas (rotas autenticadas)
Dashboard (abas Operação/Análise) · Cozinha (KDS) · Serviço · Carta (categorias/produtos/modificadores/preview) · Cierre do dia (+ detalhe, histórico) · Mesas (planta + config + QR) · Equipe · Valorações · Ajustes (só pelo menu do usuário) · Plataforma (onboarding) · Convites · Auth (login/forgot/reset).

### 2.3 Componentes compartilhados
- **`ui/` (primitivos):** `AButton`, `AIconButton`, `ATextField`, `AToggle`, `AChip`, `ASurface`, `ABottomSheet`, `AConfirmDialog`, `AProgress`, `AStarRating`.
- **`dashboard/` (dados):** `MetricCard`, `SectionCard`, `EmptyState`, `DonutChart`, `BarList`, `ProgressRing`, `DashboardTabs`.
- **`shared/`:** `LanguageSwitcher`, `ThemeSwitcher`, `RestaurantSwitcher`, `UserMenu`, `ActivityBell`/`ActivityPanel`, `DailyOperationBanner`, `ReadyOrderNotificationStack`, `AppBootstrapScreen`.

### 2.4 Fundação visual (estado real)
| Aspecto | Estado | Uso medido |
|---|---|---|
| **Cores** | `tokens.css`: primitivos → papéis M3 → status. Light quente (creme/areia), Dark grafite neutro, primário `#ff7300` invariante entre temas. | Só 7 hex crus, todos justificados (QR/recibo impresso). |
| **Tipografia** | System-font stack (provisória). 8 papéis: display 40 · headline 28 · title-lg 22 · title-md 16 · body-lg 16 · body-md 14 · label-lg 14 · label-md 12. | label-md 283× · body-md 253× · label-lg 223×. Pesos: medium 316 · semibold 135 · bold 17. |
| **Spacing** | Escala Tailwind de 4 px. | Consistente, mas gaps variam por tela sem regra: `gap-4` vs `gap-6` na raiz de página. |
| **Raio** | Escala M3 → `rounded-xs/sm/md/lg/xl/full`. | lg 118 · full 117 · md 65 · xl 13 · **fora da escala:** `rounded` 5 · `rounded-2xl` 2 · `rounded-t-2xl` 3. |
| **Sombras** | `shadow-card` (repouso) e `shadow-elevated` (flutuante). | elevated 22 · card 5 · **`shadow`/`shadow-sm` default do Tailwind: 8** (fora do sistema). |
| **Ícones** | Phosphor, consistente. | Tamanhos variam de 10 a 26 px sem escala definida. |

### 2.5 Padrões de interação
| Padrão | Implementação atual |
|---|---|
| **Botões** | `AButton`: 4 variantes, `rounded-lg`, 44 px. Mas **~110 `<button>` crus** com estilo próprio. `ModifierGroupForm` tem 7 crus contra 2 `AButton`, e `PublicMenuCatalog` tem 6 crus e nenhum `AButton`. |
| **Inputs** | `ATextField` está bom: label visível, erro e ajuda via `aria-describedby`. `<select>` cru repetido em Ajustes, Analytics e Plataforma. Checkbox nativo cru em Ajustes. |
| **Tabelas** | **Nenhuma `<table>` no app.** Equipe, histórico de fechamento e valorações são listas `divide-y`. Funciona no mobile, mas o desktop (gestão e relatórios) perde densidade e ordenação. |
| **Modais** | `ABottomSheet` (23 usos, completo: Esc, focus trap, retorno de foco, transição) **mais 4 shells paralelos**: `TableDetailsDrawer`, `TransferTableDialog`, `FloorMapEditor` e `ActivityPanel`. |
| **Menus** | 4 dropdowns (idioma, tema, restaurante, usuário) e um seletor de garçom no drawer, cada um com sua própria lógica de abrir/fechar, foco e teclado. |
| **Navegação** | Rail de 8 itens (md+), drawer no mobile. Sem bottom nav e sem atalho para Ajustes no rail. |
| **Loading** | `AProgress` (spinner) em 47 lugares. Skeleton **só** no `ActivityPanel` e no QR público. |
| **Vazio** | `dashboard/EmptyState` (ícone + frase) e mais 5 variações locais: `MenuEmptyState`, `CategoryEmptyState`, `ProductEmptyState`, `MenuSectionPlaceholder`, e o vazio inline de Equipe. |
| **Feedback de ação** | **Não existe snackbar/toast.** O sucesso aparece como texto inline ("Guardado", sem ícone), a faixa `feedback` do drawer, ou nada. Erros aparecem como `<p class="text-error">` ou como caixa `bg-error-container` sem botão de tentar de novo. |
| **Responsivo** | `md` faz a troca rail↔drawer. Grids `lg:grid-cols-[…_380/400/420px]` (3 larguras diferentes para o mesmo padrão lista+detalhe). |

---

## 3. Achados detalhados

### P0 · Crítico

**[P0-1] O laranja primário como texto falha WCAG AA no Light mode**
- **Onde:** `src/styles/tokens.css:58` (`--md-sys-color-primary` invariante) → `AButton.vue` (variantes `outlined` e `text` usam `text-primary`), 43 usos de `text-primary` (links como "Ir ao painel" em `TablesView`, `PlatformLayout`, ícones de status etc.).
- **Medido:** `#ff7300` sobre `surface #fdf8f2` = **2,58:1**. Sobre `surface-container-high #ecdcc7` (fundo dos sheets e do drawer) = **2,03:1**. AA exige 4,5:1 para texto e 3:1 para UI. No Dark o mesmo par passa (5,98:1). O token foi validado como *fundo* com texto escuro, nunca como *texto*.
- **Impacto:** todo botão secundário ("Cancelar", "Descartar", "Actualizar"), dentro de sheets, no balcão com luz forte ou num tablet com brilho baixo, fica quase invisível. Viola o `CLAUDE.md §14`.
- **Recomendação:** separar o *acento* (fill, `#ff7300`) do *texto acentuado*. Criar um papel `--color-primary-text` (ou redefinir `primary` só no Light) com valor próximo de **`#a84300`** (5,73:1 em surface, 4,51:1 em container-high) e manter `#ff7300` para fills, anéis e indicadores. Revisar também `border-outline` dos inputs, que dá **2,91:1** contra o fundo do campo (abaixo de 3:1). Algo como `#8c7b66` dá 4,09:1.
- **Comando:** `/impeccable colorize` → `/impeccable audit`.

**[P0-2] O KDS (Cozinha) não serve para cozinha em serviço**
- **Onde:** `src/views/kitchen/KitchenView.vue:45` (`tab = 'dashboard'`), `:119-161`.
- **Problema:** (a) a tela abre num **dashboard de 7 MetricCards e 6 seções**, não na fila. (b) A fila é filtrada **por um status de cada vez** via abas, então o cozinheiro nunca vê "entrou / preparando / pronto" juntos. (c) O tempo de cada comanda é texto neutro, sem escalonamento visual de urgência (só a mais antiga ganha um selo). (d) Cada card tem dois botões full-width de 48 px ("avançar" e "detalhes"), o que dobra a altura e reduz o número de comandas visíveis. (e) Título, subtítulo e linha de conexão ocupam a dobra superior.
- **Impacto:** contraria o `design-system.md §22` ("KDS: high density + high contrast, tablet-landscape-first"). Na hora do rush, o cozinheiro precisa de 2–3 toques para enxergar o que já está pronto e não percebe atraso pela cor ou pelo peso.
- **Recomendação:** abrir direto na fila. Em tablet landscape, colunas lado a lado por status (Kanban de 3–4 colunas, scroll vertical por coluna). Tempo com 3 níveis (normal / atenção / atrasado) usando os papéis `warning`/`critical` + ícone + peso. Card com uma ação primária grande e o detalhe ao tocar no próprio card. Mover o dashboard de métricas para uma aba secundária ou para o Dashboard de gestão.
- **Comando:** `/impeccable shape` (KDS) → `/impeccable layout` → `/impeccable adapt`.

**[P0-3] Garçom no celular: sem navegação persistente, e o painel de mesa não é modal**
- **Onde:** `AppShellLayout.vue:791-826` (só drawer abaixo de `md`); `TableDetailsDrawer.vue:233-238`.
- **Problema:** (a) No mobile, a prioridade nº 1 do produto (garçom: mesas, pedidos, pedidos QR, chamados), toda troca de tela custa hambúrguer → drawer → item, no mínimo 2 toques. (b) O `TableDetailsDrawer` é `role="dialog"` **sem `aria-modal`, sem backdrop, sem Escape, sem mover nem prender o foco**. O `ABottomSheet` resolve tudo isso e não é reutilizado. O conteúdo de trás continua clicável e tabulável. (c) São 503 linhas de ações (abrir, transferir, atribuir garçom, conta, pedidos, chamados) num painel de 384 px.
- **Impacto:** o fluxo principal de serviço fica lento com uma mão, e quem usa leitor de tela ou teclado se perde (WCAG 2.4.3 Focus Order, 4.1.2).
- **Recomendação:** bottom navigation bar (3–5 destinos filtrados por permissão: Serviço, Mesas/Sala, Cozinha, Mais) abaixo de `md`. Migrar `TableDetailsDrawer`, `TransferTableDialog` e `FloorMapEditor` para um único `ADialog`/`ASheet` derivado do `ABottomSheet`. Dividir o drawer da mesa em seções com progressive disclosure.
- **Comando:** `/impeccable adapt` → `/impeccable harden`.

### P1 · Importante

**[P1-1] Segmented controls e abas reimplementados 5×, com falhas de a11y**
`DashboardTabs.vue`, `DayCloseView.vue:3-25`, `MenuSectionTabs.vue`, as abas do `KitchenView` e os chips de pisos/zonas em `TablesView`. Alturas diferentes (`py-1.5` ≈ 32 px no Dashboard contra `min-h-11` no DayClose e `min-h-12` na Cozinha), raios diferentes (`rounded-md` contra `rounded-full`) e todos com `role="tablist"` **sem navegação por setas nem `tabindex` rotativo** (WAI-ARIA Tabs). → Criar `ASegmented` (até ~4 opções) e `ATabs`. `/impeccable harden`.

**[P1-2] Filter chips sinalizam seleção só por cor**
`StaffView.vue` (status e função), `TablesView.vue` (pisos e zonas): o selecionado muda só de `bg-surface-container-high` para `bg-primary-container`. `aria-pressed` existe para leitor de tela, mas visualmente é só cor (`CLAUDE.md §14`, WCAG 1.4.1). O `AChip` já existe e já prevê o ícone de check, mas só é usado em alérgenos. → `AFilterChip` com check leading. `/impeccable harden`.

**[P1-3] Alvos de toque abaixo de 44 px em pontos críticos**
- Botão "como se calcula" da saúde: **20×20 px** (`DashboardPageHead.vue:107`).
- `QuickActions` e "Ver actividad": `py-1.5`/`py-1` → ~32 px.
- "Editar plano" no card do mapa: ~32 px.
- Itens de menu de idioma, tema e restaurante: `py-2.5` → ~40 px (o `UserMenu` corrigiu os seus para `min-h-11`; os outros não).
- Textos de `text-[10px]` em marcadores de mesa (`FloorTableMarker`, `TablesView`, `ActivityBell`).

→ `/impeccable adapt`.

**[P1-4] Não existe feedback de ação transversal (snackbar/toast)**
Salvar em Ajustes mostra "Guardado" em texto cinza ao lado do botão. Aprovar pedido, alternar disponibilidade e trocar restaurante não confirmam nada visível ou anunciado. Só 7 regiões `aria-live` no app. Para staff em serviço, uma ação sem confirmação vira toque repetido. → `ASnackbar` (M3), com fila, `role="status"` e ação "Desfazer" onde o backend permitir. `/impeccable harden`.

**[P1-5] Estados de erro sem recuperação e com mapeamento duplicado**
Cerca de 10 telas montam a mesma caixa (`ASurface` + `border-error/40 bg-error-container`, que inclusive conflita com o `bg-surface-container` do próprio `ASurface`). 8 telas fazem ternário `kind === 'forbidden' ? … : kind === 'network' ? …` inline, mesmo com `describeApiError` disponível (usado em 52 lugares). Quase nenhuma tem botão "Tentar de novo" (exceções: Cozinha e bootstrap). Offline e rede não têm estado próprio. → `AErrorState` (título + mensagem + retry) e `AAlert` inline. `/impeccable harden`.

**[P1-6] Profundidade achatada: "card soup"**
Toda seção é `ASurface tone=container radius=lg bordered elevated`. Dentro dela, sub-blocos `rounded-lg bg-surface-container-high` (tempos da cozinha, métricas do drawer). Medido: container contra background = **1,12:1 no Light e 1,18:1 no Dark**. A borda Dark `rgba(255,255,255,.06)` é praticamente invisível. Resultado: tudo pesa igual, sem um "palco" claro. O Dashboard empilha 4 MetricCards, mais 2 seções, mais 3 SectionCards, mais um banner. → menos contêineres, mais agrupamento por espaço e tipografia. Reservar superfície elevada para o que é interativo ou flutuante. `/impeccable quieter` + `/impeccable layout`.

**[P1-7] Hierarquia de títulos inconsistente e sem `<h1>` no app**
O shell mostra o nome da tela num `<span>` da topbar, e cada página repete o título num `<h2 class="text-headline font-bold">` com subtítulo. A Cozinha usa `<h1>`. O Cierre não tem título. O Login usa `font-semibold`. Resultado: título duplicado na tela, leitor de tela sem `h1` na maioria das páginas, e a lógica do título no shell é uma cadeia de fallback frágil (`AppShellLayout.vue:836`, cujo fallback é "Ajustes"). → um único `APageHeader` (h1 + subtítulo opcional + ações), e a topbar sem repetir o título em md+. `/impeccable typeset`.

**[P1-8] Mapa de sala com tamanhos fixos em px**
`FloorTableMarker.vue` usa `width/height` em px vindos do layout (default 84×64) dentro de um canvas responsivo posicionado em %. Em 375 px as mesas se sobrepõem ou ficam minúsculas em relação ao canvas, e o texto interno é de 10 px. O hover `scale-105` não tem equivalente em toque. → escalar os marcadores proporcionalmente ao container (ou zoom/pan), com alternativa em lista no mobile (o Serviço já tem a lista, mas o Dashboard não). `/impeccable adapt`.

**[P1-9] Dropdowns sem primitivo: 4 implementações de menu**
`LanguageSwitcher`, `ThemeSwitcher`, `RestaurantSwitcher`, `UserMenu` e o seletor de garçom do drawer replicam abrir/fechar, `focusout`, Escape e posicionamento `absolute right-0 z-20 mt-2`. Nenhum tem navegação por setas entre `menuitem`s nem flip quando bate na borda da viewport. → `AMenu` (trigger + lista + roving focus). `/impeccable harden`.

**[P1-10] Serviço (tela do garçom) é uma pilha vertical de seções**
`ServiceView.vue`: pendentes de aprovação, alertas, mesas, disponibilidade de produtos e "Mis valoraciones", tudo em `SectionCard`s empilhados. No mobile, a lista de mesas (o que o garçom mais toca) fica abaixo da dobra sempre que há pendentes, e valorações pessoais competem com a operação. Status da mesa em círculo de 36 px com tons parecidos: `waiting_approval` e `preparing` compartilham `warning`, e `waiter_requested` e `bill_requested` compartilham `critical`, diferenciados só pelo ícone. → priorizar "o que precisa de mim agora" (pendentes e chamados) como faixa compacta, mesas em grade de toque, e o resto como secundário. `/impeccable shape`.

**[P1-11] Z-index e camadas sem escala**
`z-20` (menus), `z-30` (drawer), `z-50` (sheet e drawer de mesa), `z-[60]` (transferir), `z-[70]` (editor de planta). O `TransferTableDialog` abre *sobre* o drawer só por número mágico. → tokens de camada (`--z-menu`, `--z-drawer`, `--z-dialog`, `--z-toast`). `/impeccable harden`.

### P2 · Melhoria

| ID | Achado | Onde | Recomendação |
|---|---|---|---|
| P2-1 | Empty states duplicados (6 variações). Os da Carta são idênticos exceto ícone e texto. | `menu/*EmptyState.vue`, `StaffView`, `dashboard/EmptyState` | `AEmptyState` com variantes `inline` / `page` (ícone, título, texto, CTA). `/impeccable onboard` |
| P2-2 | Loading só com spinner centralizado (`py-24`), o que gera salto de layout quando os dados chegam. | Dashboard, Carta, Equipe, Mesas | Skeletons no formato do conteúdo para listas e métricas, e spinner só para ações. |
| P2-3 | Sem tabela real no desktop para gestão. | Equipe, Histórico de Cierre, Valorações | `ADataTable` no desktop (ordenar, densidade) e cards no mobile, conforme o `CLAUDE.md §16`. |
| P2-4 | `<select>` e checkbox nativos estilizados à mão em 3+ telas. | `SettingsView`, `AnalyticsView`, `PlatformOnboardingView` | `ASelect` e `ACheckbox` com o mesmo contrato de label, erro e ajuda do `ATextField`. |
| P2-5 | Ajustes é uma página única longa, só acessível pelo menu do usuário. | `SettingsView.vue` (699 linhas) | Navegação lateral por seção (desktop) e lista → detalhe (mobile). Considerar um item no rail para quem tem permissão. |
| P2-6 | Ações duplicadas: "Editar plano" aparece em `QuickActions` e no card do mapa, a poucos px de distância. | `OperationView.vue` | Uma única ação, no contexto do mapa. |
| P2-7 | O card "Configuração vs operação" no topo de Mesas explica a arquitetura de informação em vez de resolvê-la. | `TablesView.vue:16-31` | Deixar claro pela navegação e pelos títulos, sem um card de aviso. `/impeccable clarify` |
| P2-8 | Criar piso/zona com `ATextField` + `+` na mesma linha dos chips de seleção mistura selecionar e criar. | `TablesView.vue:50-67, 83-91` | "+ Novo piso" abre um campo inline ou um sheet. |
| P2-9 | Botão como link fora do sistema: `rounded-full` em `DailyOperationBanner` e `PlatformLayout` contra o `rounded-lg` do `AButton`. | vários | Suporte a `as="RouterLink"` no `AButton`. |
| P2-10 | Larguras de painel de detalhe divergentes: 380, 400 e 420 px; `sm:max-w-[560px]` ×3. | Mesas, Equipe, Serviço | Token de layout `--pane-detail`. |
| P2-11 | Sombras do Tailwind default (`shadow`, `shadow-sm`) fora dos dois níveis do sistema; raios fora da escala (`rounded`, `rounded-2xl`, `rounded-t-2xl`). | 8 + 10 ocorrências | Normalizar para `shadow-card`/`shadow-elevated` e `rounded-xl`. |
| P2-12 | Arquivos gigantes misturando UI e lógica: `PublicTableView` (1 249), `SettingsView` (699), `StaffDetailPanel` (523), `TableDetailsDrawer` (503). | — | Fatiar ao implementar os itens acima (não é mudança de regra de negócio). |

### P3 · Refinamento visual

| ID | Achado | Recomendação |
|---|---|---|
| P3-1 | Escala de ícones livre (10/12/14/16/18/20/22/24/26). | Três tamanhos: 16 (inline), 20 (controle), 24 (destaque). |
| P3-2 | `border-l-4` colorido no `ActivityEventItem.vue:107` (detector: padrão "side-stripe" genérico). A timeline já tem marcador com ícone, então a faixa é redundante. | Remover a faixa e manter só o marcador. |
| P3-3 | Grade de fundo com gradiente de duas direções no mapa (`RestaurantFloorMap.vue:157`, detector). Lê como "template de dashboard". | Grade bem mais sutil ou pontos, só no modo de edição. |
| P3-4 | `src/views/aforo-dashboard.html` (mock HTML versionado dentro de `src/views`) acumula 111 achados do detector (texto de 8–10 px, glow laranja, contraste 1,8:1). Não é renderizado, mas polui buscas e o detector e pode ser tomado como referência. | Mover para `docs/design/reference/` ou remover. Apagar também os `*:Zone.Identifier` não rastreados. |
| P3-5 | Números de métrica sem `tabular-nums` no `MetricCard`, então o count-up "dança" a largura. | `tabular-nums` nos valores. |
| P3-6 | Pesos: `font-bold` em headlines contra `font-semibold` no Login e nos cards. | Fixar: headline = semibold, title = medium/semibold. |
| P3-7 | Tipografia system-font provisória: sem personalidade e diferente entre Windows, macOS e Android. | Ver a direção em §7 (avaliar uma fonte variável com algarismos tabulares). |

---

## 4. Inconsistências visuais (síntese)
1. **Botões:** 4 formatos convivem: `AButton` `rounded-lg` 44 px, pílula `rounded-full` (QuickActions, banner), `rounded-md` compacto (ações de card), e link-texto.
2. **Seleção:** `primary-container` (filtros, rail), `secondary-container` (zonas), `surface-container-highest` (segmented) e `ring-2 ring-primary` (mesas sem zona). São quatro linguagens para "selecionado".
3. **Erro:** caixa `error-container`, `<p text-error>` solto e texto em `on-surface` com `role="alert"` (Cozinha).
4. **Títulos:** h1 contra h2, bold contra semibold, com e sem subtítulo, e título duplicado na topbar.
5. **Raio e sombra:** fora da escala em ~18 lugares.

## 5. Problemas de UX (síntese)
- **Toques demais no mobile** para o papel prioritário (garçom).
- **O KDS esconde o fluxo** atrás de abas e de um dashboard.
- **Sem confirmação de sucesso** nas ações frequentes.
- **Erros sem saída** (sem retry, sem estado offline).
- **Gestão sem tabelas** no desktop, e Ajustes como formulário infinito.
- **Explicações em cards** onde a navegação deveria resolver (Mesas).

## 6. Padrões genéricos, pesados ou "dashboard SaaS demais"
- **Grade de KPI cards no topo de tudo** (Dashboard, Cozinha). Metade dos números não muda decisão nenhuma durante o serviço.
- **Ícone + título em cada SectionCard**: o ícone decora em vez de informar, e se repete em 20+ cards.
- **Anel de "saúde" com score 0–100**: uma métrica abstrata em destaque no cabeçalho, quando "3 mesas precisam de você" é mais acionável. (O texto ao lado já diz isso, mas o anel ganha o peso visual.)
- **Card dentro de card com borda, sombra e tom iguais**: pesado no Light (creme sobre creme) e lamacento no Dark (contraste tonal de 1,18).
- **Login com foto, scrim, dois glows e glassmorphism**: bonito, mas é o clichê "hero SaaS". O sistema já pede que o glow seja raro, e aqui está empilhado.
- **Grid de fundo com gradiente e borda lateral colorida** (detector): marcas clássicas de template.

---

## 7. Direção visual recomendada

> **Premissa a confirmar:** "Saloa" = AFORO (mesma marca). Se for um rebrand, esta direção mantém a estrutura e troca só a camada de marca.

### "Instrumento de sala": grafite quente, laranja como sinal

O AFORO é uma ferramenta de trabalho em **modo Operate**: o sucesso é o garçom fechar a mesa e a cozinha despachar, não alguém admirar a tela. A referência certa não é "dashboard SaaS". É **instrumento**: painel de bordo, terminal de cozinha, app de carro (a ref. 2 do próprio design system). Calmo em repouso, inequívoco quando algo precisa de atenção.

**1. O laranja é sinal, não decoração.**
`#ff7300` só onde há ação principal, seleção ativa, ou algo que exige atenção agora. Texto acentuado em `~#a84300` no Light (P0-1). Gradiente e glow continuam restritos ao logo e ao login (um glow, não dois). Status (sucesso/atenção/crítico) nunca compete com o laranja da marca. O vermelho-ferrugem crítico precisa se distinguir do laranja da marca também em forma (ícone e peso), não só em matiz.

**2. Menos caixas, mais estrutura.**
Trocar card-soup por **superfícies de palco**: uma superfície por região de trabalho, com agrupamento interno por espaço, divisórias finas e tipografia. Aumentar os degraus tonais (alvo ≥ 1,3:1 entre background e container no Dark) e tornar a borda do Dark visível (~10–12% branco). `shadow-card` só em elementos tocáveis (mesa, comanda), nunca em contêineres de seção.

**3. Densidade por papel** (já prevista no `design-system.md §22`, mas não aplicada):
- **Cozinha:** colunas de comandas, alto contraste, tempo como protagonista, um toque por avanço.
- **Garçom (mobile):** bottom nav, mesas em grade de toque, "precisa de mim agora" sempre no topo.
- **Gestão (desktop):** tabelas reais, filtros persistentes, lista + painel de detalhe com largura única.
- **QR público:** o mais "consumer" e expressivo de todos, já no caminho certo.

**4. Tipografia com caráter funcional.**
Avaliar uma sans variável com algarismos tabulares e boa leitura a distância (Inter, Geist, IBM Plex Sans ou uma grotesca com personalidade levemente quente) **a partir dos assets de marca**, conforme o `CLAUDE.md §6`, e não instalar por gosto. Números (tempo, dinheiro, contagem) sempre `tabular-nums` e em peso maior que o rótulo. Um único `h1` por página.

**5. Movimento como confirmação.**
Seguindo a restrição Apple: o movimento existe para confirmar mudança de estado (comanda avança de coluna, mesa muda de status, snackbar confirma), em 150–250 ms, interrompível, e nunca para "dar vida" a números. O count-up das métricas pode ficar, mas não é prioridade.

**6. Sistema antes de telas.**
A maior parte da dívida some com **7 primitivos novos**: `APageHeader`, `ASegmented`/`ATabs`, `AFilterChip`, `AMenu`, `ASelect`, `ADialog` (unificando os 4 shells) e `AFeedback` (`ASnackbar` + `AAlert` + `AErrorState` + `AEmptyState`). Cada um nasce da necessidade de uma tela real, conforme o `CLAUDE.md §17`.

### Ordem sugerida de execução
1. **[P0]** `/impeccable colorize`: papel de texto primário acessível e borda de input (tokens só, impacto global, risco baixo).
2. **[P0]** `/impeccable shape` → `layout` → `adapt`: redesenho do KDS para tablet.
3. **[P0]** `/impeccable adapt`: bottom nav mobile e `ADialog` unificado (drawer de mesa, transferir, editor).
4. **[P1]** `/impeccable harden`: `ASegmented`, `AFilterChip`, `AMenu`, `ASnackbar`, `AErrorState`, escala de z-index, alvos de 44 px.
5. **[P1]** `/impeccable quieter` + `layout`: remover card-soup, degraus tonais, `APageHeader`.
6. **[P1]** `/impeccable shape`: reorganizar a tela de Serviço por urgência.
7. **[P2]** `/impeccable onboard` (empty/loading) e tabelas de gestão, Ajustes por seção.
8. **[P2/P3]** `/impeccable typeset` (fonte e escala de ícones) → `/impeccable polish`.

Toda etapa de implementação segue o `CLAUDE.md §19–20`: `/ui-ux-pro-max` antes, `npm run build` e validação com `agent-browser` em Light/Dark, nos 3 locales e em 375/768/1440, depois de corrigir as dependências do Chrome no WSL.

---

## 8. O que está funcionando (manter)
- **Tokens M3 em três camadas**, mapeados em `@theme`, com Light/Dark/System. Praticamente zero hex cru em componentes.
- **Paleta amostrada do logo real**, não inventada.
- **Status sempre com ícone e texto** (`useTableStatusStyle`, legenda do mapa).
- **`ABottomSheet`** é um primitivo de diálogo exemplar: Esc, focus trap robusto, retorno de foco, safe-area, reduced-motion.
- **`ATextField` / `AToggle` / `AStarRating`**: label visível, `aria-describedby`, radios nativos, alvos de 44 px.
- **Permissões vindas do backend** dirigem a navegação, nunca checagem de `role`.
- **Skip link** e `prefers-reduced-motion` respeitados em todas as transições, inclusive no `useCountUp`.
- **Reordenação mobile intencional** no Dashboard (`order-*`: problemas antes do mapa).
- **i18n disciplinado** e formatação de moeda e data por locale.
