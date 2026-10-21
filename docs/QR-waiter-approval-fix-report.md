# QR → aprovação do waiter — investigação e correção

Data: 7 de outubro de 2026. Repositório: `restaurants-web`.
Sem commit/push. Backend e configurações de staging preservados.

## 1. Causa raiz e evidências

A aprovação já existia em `OrderDetailSheet.vue`. A ausência encontrada era no caminho de acesso à ação:

- A lista pendente de `ServiceView.vue` oferecia somente uma linha clicável. O waiter precisava descobrir que abrir o detalhe revelava “Aprobar”. Reprodução antes da correção: pedido `#A101` presente, **zero botões Aprobar na lista**.
- `TableDetailsDrawer.vue` abre `TableOrdersList.vue`. Sua lista e seu detalhe tinham ação para servir pedidos `ready`, mas nenhuma aprovação para `waiting_approval`. Reprodução antes da correção: detalhe aberto, **zero botões Aprobar**.
- O footer original do sheet funcionava. Em **375×812**, o botão estava em `x=194.5, y=752, width=160.5, height=44`, dentro da viewport. Não foi encontrado defeito de overflow, slot, safe-area ou z-index que justificasse trocar o shell.
- `selectedOrder` era uma cópia independente da fila. Um refetch podia remover o pedido da fila e deixar o detalhe antigo aberto. Além disso, uma resposta GET iniciada antes de aprovar podia recolocar o pedido na fila; respostas de ações antigas não eram vinculadas ao contexto do restaurante.

Na verificação real fornecida pelo usuário, o waiter recebeu `approve_customer_orders` no restaurante 1. Portanto, não foi encontrado problema de permission nessa conta. O cenário original já não era reproduzível com um pedido pendente: a mesa 11 está fechada, seus pedidos estão `served` e Servicio apresenta “No hay pedidos pendientes.” A correção dos caminhos de UI foi reproduzida e validada com componentes reais e dados HTTP controlados; não atribuímos retrospectivamente o teste original a uma configuração que não foi observada naquele momento.

## 2. Comportamento antes

Servicio → descobrir a linha clicável → abrir sheet → Aprobar.

Mesa → Ver pedidos → abrir detalhe → nenhuma ação de aprovação.

Refetch/realtime podia deixar o sheet com uma cópia antiga; troca de restaurante não invalidava respostas de mutações nem limpava seus erros/loading.

## 3. Correção implementada

- Servicio mostra status de espera, mesa/número, soma das quantidades, tempo e total, com **Ver pedido** e **Aprobar** separados.
- Lista e detalhe de pedidos da mesa oferecem aprovação usando o mesmo `useOrderApprovals` e o mesmo `ordersService.approve`. Não foi criada outra implementação HTTP.
- `isPendingCustomerOrder` concentra a elegibilidade: origem `customer_qr`, estado `waiting_approval` e restaurante ativo. Permission continua vindo de `usePermissions`.
- O sheet acompanha o pedido na fila atual por ID e verifica novamente permission/elegibilidade. Notas por item também são exibidas na revisão.
- Loading/trava são imediatos e por pedido. Uma segunda aprovação/rejeição simultânea do mesmo pedido não envia outro POST.
- Sucesso aplica o objeto retornado pelo backend, invalida GETs anteriores, refaz a fila e atualiza dados operacionais. O detalhe da mesa recebe diretamente o objeto autoritativo e emite `approved` para o drawer atualizar a operação.
- 409/404 refazem as consultas; 403 permanece erro de autorização; 401/419 continuam com o tratamento central de sessão existente, sem retry de POST.
- Troca de restaurante/perda de permission limpa fila/erros/loading e invalida respostas anteriores. GETs são abortados; respostas tardias de POST são ignoradas pela UI. Abortar uma leitura não desfaz uma mutação que o servidor já processou.
- Reverb não foi alterado. `order.created`, `order.status_changed` e subscription/reconnect continuam alimentando o refetch existente. **Actualizar** permite refetch quando realtime está indisponível.
- AButton, ASurface/SectionCard, tokens AFORO e i18n existentes foram reutilizados. A skill local `.claude/skills/ui-ux-pro-max/SKILL.md` orientou a revisão de touch targets, espaçamento e loading.

## 4. Arquivos desta tarefa

- `src/views/service/ServiceView.vue`
- `src/composables/useOrderApprovals.ts`
- `src/components/service/OrderDetailSheet.vue`
- `src/components/dashboard/table/TableOrdersList.vue`
- `src/components/dashboard/table/TableDetailsDrawer.vue`
- `src/utils/order-approval.ts` (novo)
- `src/i18n/locales/es-ES.ts`
- `src/i18n/locales/ca-ES-valencia.ts`
- `src/i18n/locales/en-GB.ts`
- `tests/frontend-approvals.browser.ts` (novo)
- `tests/frontend-approvals.html` (novo)
- `tests/frontend-approvals.mjs` (novo)
- `tests/frontend-security.browser.ts` (fixture de pedido ajustada ao contrato)
- `docs/QR-waiter-approval-fix-report.md` (este relatório)

Nos locales, a única adição desta tarefa é `service.pending.viewOrder`. Os 25 arquivos modificados/untracked presentes no início foram comparados por SHA-256; removendo apenas essa adição dos três locales, todos mantêm os bytes originais. `.env.example`, manifests/lockfile e o hardening em andamento foram preservados.

## 5. Regra de negócio

Contrato inspecionado em leitura no backend: o QR envia itens/locale, sem inventar `status`/`origin`; `CreatePublicOrderAction` determina `customer_qr` e lê `customer_order_requires_approval`. `OrderCreationService` decide o status. O frontend conserva a resposta, e `PublicOrderSuccess` diferencia espera de envio à cozinha.

Com aprovação habilitada: **customer QR → waiting_approval → POST /api/v1/orders/{order}/approve → confirmed**. A suíte montada verificou exatamente esse caminho de aprovação e a saída da fila, sem estado otimista.

**/accept pertence à cozinha: confirmed → accepted.** Não foi usado para aprovação nem alterado.

Observação de contrato: o backend também suporta auto-confirmação quando `customer_order_requires_approval=false`; defaults e demo seed usam false. A leitura real com owner confirmou **true no restaurante 1**. Garantir aprovação obrigatória para todos os restaurantes exige decisão de regra/configuração no backend, fora desta tarefa; o frontend não deve fabricar `waiting_approval`.

## 6. Segurança e permissions

`usePermissions.can` lê a lista do restaurante ativo na organização correspondente em `authContext`, sem atalhos por role. O backend resolve o tenant pela membership ativa em `ResolveTenant` e aplica organização, restaurant scope e `approve_customer_orders` em `OrderPolicy`.

Conta real `waiter1@aforo.test`: permission correta recebida no restaurante 1 e seção pendente disponível. Nos testes: sem permission, nenhum CTA em Servicio, mesa ou sheet; permission em B não autoriza A. Pedidos de outro restaurante, de staff ou fora de `waiting_approval` não oferecem aprovação. A→B e A→B→A descartam dados/respostas anteriores. Backend permanece a autoridade de autorização.

## 7. Checks executados

Executados no frontend com Node/npm do Windows, pois os node_modules existentes contêm binários Windows. Nenhuma reinstalação ou alteração de manifests foi necessária.

| Comando | Resultado |
| --- | --- |
| `npx vue-tsc -b` | Passou |
| `npm run build` | Passou antes e depois; build final com 2008 módulos |
| `node tests/frontend-approvals.mjs --baseline` | Reprodução anterior: CTA ausente na lista/mesa; footer original visível |
| `node tests/frontend-approvals.mjs` | **65 checks funcionais + 48 responsivos**; sem erros de página |
| `npm run test:security` | **54 checks** passaram |
| `npm run test:hardening` | **115 checks**, **14 builds inválidos rejeitados** e **2 builds HTTPS/WSS válidos** passaram |
| `node tests/frontend-approvals.mjs --security-browser` | **125 checks** passaram; zero execução de payloads/alertas; sem erros de página |
| `git diff --check -- <arquivos desta tarefa previamente rastreados, exceto locales>` | Passou |

Lint: não há script/configuração de lint no projeto; não foi inventado.

A suíte nova usa agent-browser, componentes/composables/services reais e adapter HTTP simulado. O transporte Echo é simulado para exercitar os listeners/refetch reais; não representa um teste com broadcast de produção. Ela cobre permission, status/origin, isolamento, aprovação única, loading, sucesso, rejeição e confirmação, 409/404/403/401/419, races GET/POST/A→B→A, concorrência por pedido, refetch sem realtime e eventos de criação/status.

## 8. Validação responsiva

375×812, 768×1024, 1024×768 e 1440×900, claro/escuro. Os três idiomas foram verificados em cada combinação. CTA da lista com altura **44 px**, sem overflow horizontal. Sheet com **30 linhas** manteve footer visível, hit-test correto, focus-visible e aprovação acionável. Exemplos: mobile `y=752..796`; tablet retrato `y=912.796875..956.796875`.

Screenshots temporários foram inspecionados visualmente, incluindo mobile escuro e tablet claro, e ficaram fora do repositório. O shell real usa drawer mobile em z-30; o sheet usa z-50. Não há barra inferior fixa nesse shell.

## 9. Validação real, riscos e observações

- QR fornecido resolve **AFORO Malvarrosa / restaurante 1 / Mesa 11**; API retorna `session.active=false`.
- Login real do waiter e acesso a Servicio realizados. Conta recebeu permission correta, fila estava vazia, e os pedidos da mesa 11 retornaram `served`. O pedido QR 647 já possui `approved_at`; não o aprovamos nesta tarefa.
- Login real do owner em sessão separada e GET de settings confirmaram `customer_order_requires_approval=true`. Nenhuma configuração foi alterada.
- Não criamos/rejeitamos/aprovamos pedidos reais nem reabrimos a mesa. A validação manual completa de criação QR → aprovação exige uma sessão ativa e novo pedido pendente. Essa parte permanece para a revisão operacional; credenciais já foram verificadas.
- Realtime automático foi validado com transporte simulado. Não foi afirmado broadcast real de um novo pedido neste ambiente sem pedido novo.
- Abrir pedidos da mesa também instancia a fila de aprovação para usuários autorizados; isso acrescenta leitura da fila, sem duplicar POST. A ação da mesa aceita o snapshot obtido por sua própria consulta, sem depender do sucesso dessa leitura adicional.
- Não houve alteração de backend, banco via scripts, Redis, Supabase, Reverb, staging, deploy, Docker, pagamentos ou fluxo da cozinha.
- Capturas de git abaixo incluem alterações anteriores de hardening, inclusive conversões de fim de linha. Arquivos novos/untracked não entram em `git diff --stat`. O diff completo não deve ser atribuído a esta tarefa.

## 10. git status --short

```text
 M .env.example
 M docs/PR-2B-frontend-hardening-report.md
 M docs/PR-2B.1-frontend-hardening-correction-report.md
 M package-lock.json
 M package.json
 M src/api/errors.ts
 M src/api/http.ts
 M src/api/public-http.ts
 M src/api/retry-after.ts
 M src/api/session.ts
 M src/api/timeouts.ts
 M src/components/dashboard/table/TableDetailsDrawer.vue
 M src/components/dashboard/table/TableOrdersList.vue
 M src/components/service/OrderDetailSheet.vue
 M src/composables/useOrderApprovals.ts
 M src/config/env.ts
 M src/config/runtime.ts
 M src/i18n/locales/ca-ES-valencia.ts
 M src/i18n/locales/en-GB.ts
 M src/i18n/locales/es-ES.ts
 M src/main.ts
 M src/realtime/echo.ts
 M src/services/product.service.ts
 M src/utils/table-public-url.ts
 M src/views/LoginView.vue
 M src/views/service/ServiceView.vue
 M tests/frontend-hardening-build.mjs
 M tests/frontend-hardening.mjs
 M tests/frontend-security.browser.ts
 M vite.config.ts
?? docs/QR-waiter-approval-fix-report.md
?? src/utils/order-approval.ts
?? t.txt
?? tests/frontend-approvals.browser.ts
?? tests/frontend-approvals.html
?? tests/frontend-approvals.mjs
```

## 11. git diff --stat

```text
 .env.example                                       |   58 +-
 docs/PR-2B-frontend-hardening-report.md            |  452 +-
 ...PR-2B.1-frontend-hardening-correction-report.md |  306 +-
 package-lock.json                                  | 5420 ++++++++++----------
 package.json                                       |   72 +-
 src/api/errors.ts                                  |  206 +-
 src/api/http.ts                                    |   36 +-
 src/api/public-http.ts                             |   40 +-
 src/api/retry-after.ts                             |   16 +-
 src/api/session.ts                                 |   26 +-
 src/api/timeouts.ts                                |    4 +-
 .../dashboard/table/TableDetailsDrawer.vue         |    1 +
 src/components/dashboard/table/TableOrdersList.vue |   58 +-
 src/components/service/OrderDetailSheet.vue        |   18 +-
 src/composables/useOrderApprovals.ts               |   72 +-
 src/config/env.ts                                  |   82 +-
 src/config/runtime.ts                              |    4 +-
 src/i18n/locales/ca-ES-valencia.ts                 | 3211 ++++++------
 src/i18n/locales/en-GB.ts                          | 3211 ++++++------
 src/i18n/locales/es-ES.ts                          | 3225 ++++++------
 src/main.ts                                        |   64 +-
 src/realtime/echo.ts                               |  144 +-
 src/services/product.service.ts                    |  148 +-
 src/utils/table-public-url.ts                      |   70 +-
 src/views/LoginView.vue                            |  500 +-
 src/views/service/ServiceView.vue                  |   62 +-
 tests/frontend-hardening-build.mjs                 |  154 +-
 tests/frontend-hardening.mjs                       |  270 +-
 tests/frontend-security.browser.ts                 |    2 +-
 vite.config.ts                                     |   56 +-
 30 files changed, 9053 insertions(+), 8935 deletions(-)
```

Sem commit/push; pronto para revisão.
