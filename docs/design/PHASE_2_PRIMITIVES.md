# Fase 2 — primitivos P0 SALOA

Fonte visual: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), especialmente §10, §12,
§13 e §19–21. Fundação: [PHASE_1_TOKENS.md](PHASE_1_TOKENS.md).
Os valores de `tokens.css` e `tokens-v2.css` foram preservados, assim como
fonte, dependências e configurações de tema.

## 1. Auditoria anterior à edição

| Componente/sistema | API e comportamento encontrados | Usos |
|---|---|---|
| AButton | `variant=filled/tonal/outlined/text`, `type=button/submit`, disabled, loading, fullWidth; slots default/leading/trailing; emit click. Button nativo com foco visível, loading desabilita; spinner alterava a composição. `$el` usado para retorno de foco em StaffDetailPanel. | 188 |
| AIconButton | label obrigatório; type, disabled, pressed; variant default/onMedia; slot default; emit click. Circular 44 px. onMedia usava branco diretamente sobre mídia. | 29 |
| ABottomSheet | label obrigatório, dismissible=true; slots default/footer; close depois do leave; montagem por v-if. Teleport, Escape, retorno de foco e correção de Tab depois da navegação nativa, incluindo radios/controles disabled. Bottom no mobile e centralizado a partir de 640 px; sem scroll lock. | 21 |
| AConfirmDialog | label, message, confirmLabel, loading; emits confirm/cancel. Base ABottomSheet. Usado para pagamento, fechamento e revogação de convite; nem toda confirmação é destrutiva. | 3 |
| ASurface | tone, radius, as, bordered, elevated; slot default. Escada tonal/radius/sombras M3. | Mantido |
| Status | `useTableStatusStyle` mapeia estados backend para ícone/tom/label; existem badges locais e alertas operacionais. | Mantidos |
| Feedback | Mensagens inline, ReadyOrderNotificationStack persistente e ActivityPanel com lógica própria; nenhum snackbar genérico. | Mantidos |
| Headers | DashboardPageHead e headings locais; nenhuma API compartilhada de page header. | Mantidos |

Não havia composable compartilhado de foco/scroll lock. Dependências já
disponíveis: Vue, Vue Router, Vue I18n e Phosphor. A direção SALOA prevaleceu
sobre as instruções visuais M3 ainda presentes no CLAUDE.md.

## 2. Componentes criados e evoluídos

**Novos públicos:** ADialog, ASheet, APageHeader, AStatusBadge, ASnackbar;
composable `useSnackbar()`.

**Evoluídos:** AButton e AIconButton; ABottomSheet extrai somente o
comportamento compartilhado, preservando apresentação/slots/evento close;
AConfirmDialog passa a usar ADialog e mantém os eventos originais.

**Base privada:** AButtonContent, button.ts/button.css; AOverlay,
overlay.ts, overlay-focus.ts e useOverlayFocus. ADialog, ASheet e
ABottomSheet usam o mesmo controlador de foco, pilha, inert e scroll lock.

**Integração mínima:** App.vue monta um ASnackbar fora das condições
existentes; não há chamadas novas de feedback nos fluxos. style.css importa
o tratamento compartilhado dos botões na camada `components`, permitindo
os overrides utilitários existentes. ASurface e os mappers de domínio não
foram alterados.

## 3. APIs públicas

### AButton

- `variant`: primary (default), secondary, ghost, danger e aliases antigos.
- `size`: sm/md/lg; `type`: button/submit/reset; disabled, loading e fullWidth.
- `as`: button (default), a, 'RouterLink' ou o componente RouterLink;
  `to` e `replace` para navegação. Links disabled/loading perdem href/tab stop
  e bloqueiam click/auxclick; links habilitados usam o RouterLink existente.
- Slots default/leading/trailing; emit `click(MouseEvent)`.
- `$el` continua sendo o controle; método `focus()` também disponível.
- Declarar `:loading="false"` já reserva a célula que receberá o spinner.
  O rótulo e trailing continuam visíveis e a largura fica estável ao alternar
  loading. Recomenda-se manter o rótulo enquanto a ação está em andamento.
- `iconOnly` é um detalhe compartilhado usado pelo AIconButton.

### AIconButton

- label obrigatório; size, type, disabled, loading, pressed e variant.
- Slot default; emit click; mesma base de controle do AButton.
- Quadrado 44/52 px em mouse; sm 32 somente com pointer fine, com alvo
  estendido para 44. Touch e dispositivos híbridos usam mínimo 48, mantendo
  lg em 52; sm não permanece pequeno nesses dispositivos.
- Ícones 16/20/24; radius-md e aria-label/aria-pressed/aria-busy.

### ADialog e ASheet

Props comuns: `title` obrigatório, `open=true`, `dismissible=true`,
`closeOnScrim=true`, `closeOnEscape=true`, `initialFocus` (seletor dentro do
painel ou HTMLElement), `beforeClose?: () => boolean | Promise<boolean>`.
Slots: default (body), header (conteúdo inline do heading) e footer.
Eventos: `update:open(false)` quando o fechamento é solicitado e permitido;
`close` após o leave; `close-error(error)` se o guard rejeitar.

Usar `v-model:open` ou montagem por v-if com remoção no evento close. O guard
é um ponto de integração para a confirmação de formulário sujo: o primitivo
não inspeciona formulários, não usa confirm nativo e não conhece o domínio.

- **ADialog:** size sm/md = 400/560; centralizado em ≥768, até 85% da área
  disponível; adapta para bottom sheet em compact, até 92%. Com teclado ou
  pouca altura disponível, o painel pode ocupar toda a altura visível.
- **ASheet:** variant bottom/side, size sm/md e modal=true. Bottom permanece
  modal. Side sm usa pane-detail 420 e md usa 560; abre à direita. Side
  `modal=false` mantém o fundo operável, sem trap/inert/scroll lock. Em compact,
  a apresentação side também se adapta para bottom, preservando modal=false.
- Fundo elevado e sombra modal; hairline Dark; scrim quando modal; safe-area
  superior/lateral/inferior. Header/footer permanecem fora do scroll do body;
  têm scroll próprio quando textos ampliados exigem espaço adicional.
- Duração do Transition vem dos tokens e considera os filhos animados;
  o lock e o retorno de foco aguardam o término do leave.

### APageHeader

`title` obrigatório; description, breadcrumbs (`{label,to?}[]`), back
(`true` ou RouteLocationRaw), backLabel e context. Slots breadcrumbs,
back, description, context e actions; emit back. Com back=true, o consumidor
trata o evento. Com destino, RouterLink navega. Em compact, breadcrumbs
podem derivar o destino do ancestral mais próximo, excluindo a página atual.

Renderiza um h1, sem criar topbar. Ações quebram linha e a primary fica
full-width em compact. O consumidor limita a quantidade de ações da §12;
não foi criado AMenu nem uma lógica implícita para esconder ações.

### AStatusBadge

`state=normal | attention | warning | critical | success | disabled`,
label obrigatório e icon opcional (componente Phosphor). Ícone padrão por
estado, texto visível, tom, fundo e peso; mínimo 24 px, radius-sm e ícone 16.
Normal pode receber o ícone do objeto pelo consumidor. Não importa tipos,
status, serviços ou regras do backend. Não substitui useTableStatusStyle.

### ASnackbar e useSnackbar

Um host é montado em App.vue. `useSnackbar()` retorna current/pendingCount/
actionPending somente leitura e showSnackbar, dismiss, pause, resume e
performAction. attachHost é a coordenação interna do host. A factory
createSnackbarQueue permite testes isolados; a aplicação usa o singleton SPA.

```ts
const { showSnackbar, dismiss } = useSnackbar()
const id = showSnackbar({
  message: mensagemJaTraduzida,
  action: { label: acaoJaTraduzida, onClick: executarAcao }, // opcional
  kind: 'success', // info | success | warning | danger; default info
  duration: 6000, // opcional; milissegundos
})
dismiss(id)
```

Uma mensagem por vez; default 4000 ms, 6000 com ação; duration=0 exige
dismiss explícito. Pausas de hover e foco são independentes. Mensagens
enfileiradas não consomem timeout; sem host montado o timer para. Dois hosts
acidentais não duplicam o feedback. Ação assíncrona pausa o timer, bloqueia
execução repetida e dispensa a mensagem ao terminar; uma ação antiga não pode
dispensar a seguinte. Rejeição é emitida como action-error pelo ASnackbar;
o consumidor continua responsável pelo tratamento da falha da ação.

Visual invertido, largura máxima 480, radius-md, elevação floating, role
status/polite. Em compact reserva 56 px da futura bottom nav mais safe-area
e gutter; lê `--bar-bottom` se ele vier a existir, sem definir novo token.
Em ≥768 fica no inferior centralizado. O painel procura um intervalo livre
entre controles visíveis, priorizando a posição inferior, para não cobrir CTA
nem controle focado. Sem espaço, a exibição e o timeout aguardam; detalhes e
limites da validação estão em Mobile-first validation. O foco da ação usa a cor de texto inversa, garantindo
contraste sobre essa superfície também inversa.

## 4. Compatibilidade e aliases temporários

| Entrada antiga | Nova apresentação |
|---|---|
| filled | primary |
| tonal / outlined | secondary |
| text | ghost |
| AIconButton default | ghost |
| AIconButton onMedia | secondary opaco, usando surface/fg para contraste sobre mídia |

Não há warnings de alias por render, para evitar ruído nos usos existentes.
Os nomes continuarão aceitos até a limpeza da migração. Os slots e emits
antigos continuam funcionando. Nenhuma chamada em páginas foi migrada.

AConfirmDialog mantém primary por default: seus consumidores incluem
pagamento e fechamento, além de revogação. `confirmVariant="danger"` está
disponível para o consumidor declarar uma confirmação destrutiva sem o
primitivo inferir regras pelo texto ou pelo contexto.

## 5. Acessibilidade implementada

- Controles nativos, foco visível 2 px/offset 2, disabled real para buttons
  e aria-disabled/remoção de href em links; aria-busy durante loading.
- Slots de ícone decorativos escondidos da árvore acessível; icon button
  exige label. Loading estático quando reduced-motion está ativo.
- Modais com role dialog, aria-modal e aria-labelledby; foco em campo
  habilitado, heading ou alvo explícito; retorno ao trigger conectado.
- Tab continua nativo, com correção posterior para impedir escape, sem
  supor que cada radio seja um tab stop. Só o overlay superior reage a Escape.
- Fundo inert, trava de scroll compartilhada, restauração de overflow,
  padding e inert anteriores; unmount externo também libera os recursos.
- Reduced-motion vira fade de duration-fast; header/footer preservam foco
  e o body scrolla. Dismiss não depende de gesto ou mouse.
- Status exige texto + ícone; snackbar mantém região polite, pausa no foco
  e tem ações/dispensa nativas com alvo de 48 px em touch/híbridos.
- Textos do produto passam por props/slots localizados ou por chaves common
  já existentes. Não foram adicionadas strings de interface fora do i18n.

## 6. Testes e build

Resultados da implementação inicial; os resultados da revisão responsiva
estão registrados separadamente em Mobile-first validation.

- `node tests/frontend-primitives.mjs`: **93 verificações** dos componentes
  Vue reais montados, mais correção de Tab nas duas direções e testes de
  relógio da fila. Cobre aliases, loading/disabled/attrs, navegação RouterLink,
  ARIA, foco/retorno, nested modals, scroll/inert, guard e controlled open,
  compatibilidade legada, seis badges, h1/slots/ações e host único de snackbar.
- O host de teste usa a API de renderer do Vue e compila os SFCs de cliente
  com dependências já instaladas. Não representa CSS, layout nem Tab nativo.
  Executado com Node 24.19.0; utiliza registerHooks e mock.timers.
- `node tests/frontend-design-tokens.mjs`: **50 valores**, **72 pares WCAG**,
  **81 utilitários**; contrato da Fase 1 preservado.
- `npm run test:hardening`: **115 verificações + 18 builds negativos + 2
  builds seguros HTTPS/WSS**, aprovado fora do sandbox.
- `npm run test:security`: **54 verificações**, aprovado fora do sandbox.
- `node tests/frontend-invitations.mjs`: **50 verificações**, aprovado.
- `node tests/frontend-password-reset.mjs`: **27 verificações**, aprovado.
- As duas últimas suítes tiveram aviso de socket HMR EPERM no sandbox,
  sem impedir suas asserções. Convites também emite aviso de lifecycle em
  composable chamado fora de componente; sua fixture usa views placeholders.
- `npm run build`: vue-tsc + Vite aprovados. Não existe script lint.
- `git diff --check`: aprovado nos arquivos alterados nesta fase.

**Navegador pendente:** `node tests/frontend-primitives.browser.mjs` foi
executado fora do sandbox. Chrome encerrou antes de carregar a fixture por
falta de `libnspr4.so`. Não há screenshots nem resultado de CSS/layout,
teclado nativo, responsividade ou revisão visual aprovado. A mesma limitação
bloqueia as suítes browser existentes (QR, cozinha/aprovações, disponibilidade,
atribuição, realtime, histórico e operação diária). Nenhuma dependência foi
instalada. A fixture e seu runner agora incluem 375/768/1024 landscape/1440
e mobile landscape, Light/Dark, textos PT/ES/EN, Tab/Shift+Tab/Escape,
zoom de texto e screenshots em /tmp quando o Chrome estiver disponível.

## 7. Riscos e divergências

1. **Tipografia ausente na fundação:** a Fase 1 manteve a escala M3 e não
   disponibilizou text-body 15, label 13, page-title/section-title, seus
   tracking e entrelinhas. Esta fase não cria tokens, não calcula tamanhos
   artificiais nem instala fonte. Usa os papéis existentes (body-lg 16,
   label-lg 14, title-lg 22, headline 28; page header mobile usa o token
   Tailwind 2xl 24). A escala exata da §4 continua pendente.
2. **Visual global dos primitivos:** todos os consumidores existentes dos
   botões/ícones recebem o tratamento V2. onMedia fica opaco; AConfirmDialog
   adapta em 768 em vez dos 640 do wrapper antigo. Não é uma migração de tela,
   mas precisa de revisão visual real, especialmente QR, KDS e formulários.
3. **Loading:** declarar o prop loading reserva a célula do indicador antes
   da ação, aumentando a largura de alguns botões; não mudar o rótulo durante
   loading é responsabilidade do consumidor.
4. **Compatibilidade modal:** ABottomSheet preserva sua apresentação legada,
   inclusive classes fora do novo padrão; só compartilha comportamento.
   Nested overlays devem usar essa base. Os Teleports de impressão existentes
   não são modais interativos e não foram alterados. Não há remoção forçada
   de overlays antigos nem um limite novo que bloqueie fluxos legados.
5. **Contraste:** os pares dos tokens passaram; não se trata de uma auditoria
   completa de todos os consumidores. Combinações M3 fora da paleta SALOA e
   overrides de classes permanecem para revisão por tela.
6. **Foco e layout reais:** inert, teclado virtual, zoom, movimento reduzido,
   pausa em hover e reposicionamento do snackbar precisam de validação em
   navegador. O host de teste não substitui essa etapa.
7. **Divergências documentais:** AGENTS.md ainda aponta para
   DESIGN_SYSTEM_SALOA.md; CLAUDE.md ainda descreve M3 como autoridade visual.
   O pedido atual resolve a precedência a favor de DESIGN_SYSTEM.md. Esses
   arquivos não foram reescritos nesta fase.

## 8. Decisões para as fases seguintes e remoções futuras

- **Fase 3:** integrar shell, sidebar/rail/bottom nav e altura real da barra;
  revisar a convivência de snackbar/modal e de notificações persistentes.
- **Fase 4:** adotar primitivos nas telas, integrar guards de formulário
  sujo com uma confirmação de descarte, escolher danger nos casos destrutivos
  e conectar o mapper de domínio ao AStatusBadge. Implementar gestures de
  sheet com velocidade quando houver o fluxo real; fechar por botão/Escape
  já funciona. Contexto KDS 56 px permanece fora desta fase.
- Resolver os papéis tipográficos por decisão explícita na fundação antes
  de tentar fidelidade tipográfica completa. O gate de marca permanece.
- Após migrar consumidores: ABottomSheet pode ser removido; os aliases
  filled/tonal/outlined/text/default/onMedia podem sair. AConfirmDialog pode
  permanecer como composição útil. useTableStatusStyle, wrappers locais de
  modal, headers e badges só são aposentados quando seus consumidores forem
  migrados; ASurface segue o plano de limpeza original.
- Não foram alterados AppShellLayout, KitchenView, ServiceView, Dashboard,
  páginas inteiras, APIs, contratos, stores, autenticação, permissões ou rotas.

## 9. Revisão do diff

Revisados os props/slots/emits legados, navegação disabled, fonte/tokens,
foco e lifecycle de modais. A lógica modal está centralizada no controlador
compartilhado; não há implementação independente de trap/scroll lock em
ADialog ou ASheet. App.vue recebeu apenas import e montagem do host. Nenhum
fluxo passou a disparar snackbar e nenhum estado operacional foi remapeado.

## Mobile-first validation

Revisão de 26/10/2026, limitada aos primitivos P0 existentes. Foram preservados
props, slots, emits, aliases e a API de `useSnackbar()`. Não houve alteração
de páginas, AppShell, rotas, backend, stores, auth ou regras de negócio.
Nenhum token, fonte ou dependência foi criado/instalado nesta revisão.

### Problemas corrigidos

- **AButton/AIconButton:** textos e controles podem encolher e quebrar linha
  dentro do container. Touch, inclusive dispositivo híbrido com mouse, recebe
  mínimo 48×48; lg mantém 52. Em mouse puro, md mantém 44 e sm mantém 32 com
  área expandida para 44. Isso atende também ao mínimo QR nos controles touch
  destes primitivos; os controles próprios da tela pública não foram migrados
  nem certificados. O aumento dos alvos afeta visualmente os consumidores
  existentes em touch, sem editar suas páginas. Hover só oferece feedback visual; ações continuam sendo
  acionadas por toque, click ou teclado, com foco e estados disabled/loading.
- **ADialog/ASheet:** a base privada AOverlay acompanha altura, largura e
  deslocamento do VisualViewport, com fallback para innerHeight/innerWidth.
  ADialog e side sheet usam apresentação bottom em compact. Teclado aberto
  ou altura útil ≤32rem permite ocupar a altura disponível; em compact ou
  landscape baixo, também remove os cantos e o padding externo. Header com
  título longo não empurra o botão fechar para fora; footer reorganiza ações
  em compact. Conteúdo rola internamente; header/footer têm limites e scroll
  próprios para textos grandes. O campo focado é revelado no scroll do body,
  preservando estado e foco ao redimensionar/rotacionar. A lógica de trap,
  Escape, retorno de foco, inert e scroll lock continua compartilhada.
- **APageHeader:** reduz o gap compacto para space-3, permite quebra do h1,
  descrição, contexto e breadcrumbs e limita a largura das ações. Em 375,
  as ações ficam em nova linha e primary ocupa a largura disponível. Não há
  ocultação de ações nem menu novo. Desktop preserva ações inline quando cabem.
- **AStatusBadge:** ícone e texto permanecem presentes; o rótulo longo quebra
  linha dentro da largura disponível, sem ellipsis nem significado só por cor.
  O badge é informativo, portanto não recebe altura artificial de controle.
- **ASnackbar:** mensagem e ação longa usam colunas que permitem reflow;
  dispensa permanece visível e a ação pode ocupar uma segunda linha. Respeita
  gutters, safe-area superior/inferior/lateral e largura máxima de 480 no
  tamanho de texto padrão. Reserva 56 + safe-area + gutter para a futura
  bottom nav em compact, lendo `--bar-bottom` quando existir. Ao detectar
  teclado, usa a área visível sem reservar uma barra que estará escondida.
  O posicionamento evita controles visíveis mesmo quando não estão focados.
  Se não houver intervalo livre para a mensagem inteira, ou o host estiver
  inert sob um modal, ela fica temporariamente oculta e o timeout pausado;
  viewport, scroll, foco ou mudança do DOM permitem reavaliar o espaço.
  Toque não deixa hover preso; a pausa durante o toque termina no pointerup
  ou pointercancel. Desmontar o host também libera suas pausas responsivas,
  inclusive se interromper um toque. A fila, ação, duração e API pública
  foram mantidas.

`useVisualViewport.ts` concentra a geometria usada por overlay/snackbar;
`snackbar-placement.ts` concentra o cálculo de espaço livre. A variável CSS
privada `--overlay-visible-height` é uma medida do viewport, sem nova escala
visual. Radius, cores, elevação, z-index e motion continuam usando tokens V2.

### Matriz de tamanhos

| Viewport de referência | Validação estrutural e comportamento esperado | Visual em navegador |
|---|---|---|
| 375×812, portrait | Dialog/side em bottom, ações de footer e primary do header full-width, quebra de rótulos, gutter e reserva inferior do snackbar | Bloqueada |
| 768×1024, portrait | Dialog centralizado com largura limitada; side com largura estrutural; ações inline quando couberem | Bloqueada |
| 1024×768, landscape | Limites de largura/altura, scroll interno, preservação do foco e densidade com mouse; alvos touch continuam maiores | Bloqueada |
| 1440×900, landscape | Dialog 400/560, side 420/560, snackbar limitado/centralizado; densidade de mouse mantida | Bloqueada |
| 812×375 e 900×1440 | Altura curta e orientação adicional; expansão vertical quando necessária e conteúdo preservado | Bloqueada |

Para cada tamanho: pointer fine, coarse e híbrido; texto padrão, viewport CSS
equivalente a zoom 200% e fonte raiz ampliada a 200%: **54 cenários**.
São contratos da cascata CSS, limites e geometria simulada, sem engine de
layout. Não medem scrollWidth renderizado, posição real dos textos ou zoom
nativo. Nenhum teste estrutural deve ser interpretado como screenshot aprovado.

### Touch, teclado, safe-area e i18n

- **Touch/pointer fine:** a cascata foi verificada para os três tamanhos dos
  controles, incluindo dispositivo com any-pointer:coarse e pointer:fine.
  Os alvos menores ficam restritos a mouse puro; ícones não perdem o label.
- **Teclado físico:** os 93 testes existentes continuam cobrindo ARIA,
  Escape, trap/correção de Tab e retorno ao trigger, disabled e scroll lock.
  Tab nativo permanece preparado na fixture browser, ainda não executado.
- **Teclado virtual:** testes montam ADialog/ASheet reais e simulam redução
  do VisualViewport, offset superior e foco em campo fora da área do body;
  verificam redimensionamento, expansão e scroll interno sem perder valor/foco.
  Pinch zoom não é confundido com abertura de teclado. Campos mobile têm
  fonte mínima de 16px para evitar o zoom automático de foco do iOS.
- **Safe-area:** verificados env(safe-area-inset-top/bottom) no CSS dos
  overlays/snackbar, além das laterais. A resposta a notch e indicadores de
  gesto reais precisa de dispositivo/navegador; a fixture não os simula.
- **Textos PT/ES/EN:** frases longas são montadas nos componentes e permanecem
  completas, com regras de quebra e sem truncamento de informação essencial.
  Português existe apenas como conteúdo da fixture, sem adicionar locale ao
  produto. Espaçamento em rem acompanha ampliação do texto.
- **Reduced-motion/contraste:** regras existentes preservadas; nenhuma cor
  foi alterada e os testes dos pares WCAG da fundação continuam passando.

### Verificações desta revisão e limitações

- `node tests/frontend-primitives.mjs`: aprovado, **93 verificações** e os
  testes adicionais existentes de Tab/fila/timeout/ações/pausas.
- `node tests/frontend-primitives-responsive.mjs`: aprovado, **54 cenários
  CSS**, textos PT/ES/EN, posicionamento acima de CTA, adiamento/timeout da
  fila sem espaço, teclado/rotação/zoom simulado e limpeza dos listeners.
- `node tests/frontend-design-tokens.mjs`: aprovado, **50 valores, 72 pares
  WCAG e 81 utilitários**, sem regressão nos tokens.
- `npm run build`: vue-tsc + Vite aprovados. Não há script lint.
- Nova tentativa de `node tests/frontend-primitives.browser.mjs`: bloqueada
  antes de abrir a página; Chrome no WSL encerra com **libnspr4.so ausente**.
  Não foram instaladas dependências para contornar o ambiente. A fixture foi
  ampliada para os tamanhos acima, textos longos, sheets, CTA e zoom de texto;
  as asserções visuais/browser ainda aguardam execução.
- Revisão de escopo e whitespace dos arquivos desta revisão: aprovada.
  `git diff --check` global encontra CRLF/whitespace em alterações anteriores
  fora deste escopo; esses arquivos foram preservados.

**Limites:** a validação estrutural não permite certificar 100% do layout,
zoom nativo, teclado Android/iOS, scroll lock no Safari ou toque físico. Sem
VisualViewport, o fallback depende do resize fornecido pelo navegador. Slots
com conteúdo próprio de largura fixa ainda exigem revisão do consumidor.
O adiamento do snackbar evita sobrepor controles, mas uma tela muito densa
pode atrasar seu feedback até haver espaço; esse caso precisa de avaliação
visual na adoção por tela. Full-screen específico do detalhe de mesa, gestos
e integração com a barra inferior real permanecem nas fases de shell/telas.
Nenhuma dessas fases foi iniciada.
