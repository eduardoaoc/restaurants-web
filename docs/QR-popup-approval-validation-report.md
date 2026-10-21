# QR — aprovação no drawer: validação local e correções complementares

21 de outubro de 2026 · Europe/Madrid. Sem commit, push ou deploy.

## Resultado e causa

O caminho principal **já estava implementado e funcionou no ambiente habitual**: abrir Mesa 11 em Servicio mostra #654 e Aprobar; o detalhe interno permite revisar itens e aprovar sem mudar de tela ou abrir outro modal. Não foi necessário criar endpoint, botão, tradução ou implementação paralela.

A inspeção e novos testes reproduziram duas falhas complementares:

1. Resposta perdida após commit: o POST podia aprovar no servidor e falhar no transporte; a cópia pendente permanecia acionável sem reconciliação. Reprodução anterior registrada em `/tmp/qr-popup-approval-before.log`, falhando em `lost response reconciles committed approval before retry`.
2. Duas instâncias do composable (fila e drawer) tinham travas independentes. O teste de duas listas montadas enviava dois POSTs para o mesmo pedido; reprodução em `/tmp/qr-popup-approval-shared-before.log`. O backend impedia a segunda transição, mas não a duplicação de chamadas pela UI.

Também foi reforçado o isolamento de sessão no componente: o drawer real já monta a lista com `:key="table.session.id"`; agora a lista e suas mutações descartam respostas anteriores mesmo quando a prop de sessão muda sem remontagem.

## Fluxo e funcionalidades reaproveitadas

`CreatePublicOrderAction`/`OrderCreationService` → customer_qr/waiting_approval → `GET /api/v1/orders?restaurant_id=1&table_session_id=490` → `TableDetailsDrawer` → `TableOrdersList` → `useOrderApprovals` → `ordersService.approve` → `POST /api/v1/orders/654/approve` → resposta OrderResource/confirmed → atualização do histórico e evento approved → refetch de operações e fila de Servicio.

A consulta da sessão não filtra waiting_approval. A consulta da fila usa explicitamente waiting_approval e restaurante ativo. A permission vem de `usePermissions`/auth context do restaurante; `isPendingCustomerOrder` continua centralizando origem customer_qr, restaurante e status. AButton, detalhe interno, OrderDetailSheet e confirmação de rejeição existentes foram preservados.

Aprovação é **waiting_approval → confirmed**. Aceite da cozinha é outra ação, **confirmed → /accept → accepted**. Nenhum /accept foi usado na validação real.

## Alterações desta tarefa

Somente em `restaurants-web`:

- `src/composables/useOrderApprovals.ts`: trava reativa compartilhada por pedido, projetada no restaurante ativo; liberação após término inclusive se a instância mudou de contexto ou desmontou. GET autoritativo após falha de rede/servidor; se a leitura falhar, outra tentativa, inclusive em outra instância da interface, precisa primeiro reconciliar antes de enviar POST. O marcador compartilhado sobrevive à desmontagem da instância iniciadora. Respostas autoritativas alimentam fila/callback, e pedidos já resolvidos não voltam por snapshots antigos. Geração de contexto também pode acompanhar a sessão.
- `src/components/dashboard/table/TableOrdersList.vue`: passagem da sessão ao composable; troca de sessão limpa lista/detalhe e aborta consultas; continuação de aprovação verifica sessão e restaurante.
- `src/views/service/ServiceView.vue`: dados operacionais passam a atualizar pelo callback autoritativo, inclusive quando um POST confirmado perdeu sua resposta HTTP. Removido refetch duplicado nos handlers de sucesso.
- `tests/frontend-approvals.browser.ts`: testes de reconciliação, retry, duas instâncias concorrentes, histórico, 404/409 no drawer, descarte de respostas de outra sessão; adapter de sessão mais fiel. A captura responsiva cria outro ID de fixture para não regredir o pedido aprovado.
- `tests/frontend-approvals.mjs`: permite reutilizar o Vite existente por APPROVAL_TEST_BASE_URL.
- `docs/QR-popup-approval-validation-report.md`: este relatório.

`restaurants-api`: **nenhum arquivo alterado nesta tarefa**. Actions, policies e testes existentes reaproveitados.

Os hashes de todos os arquivos preexistentes foram comparados com a captura inicial em `/tmp/qr-popup-approval-baseline`: somente os cinco arquivos de código/teste acima mudaram; o relatório é novo. Todos os outros arquivos, incluindo .env, templates de staging, segurança, catálogo, QR e relatórios anteriores, mantiveram seus bytes. As branches continuam `fix/security-hardening` na API e `main` no frontend.

## Segurança, concorrência e erros

O controller limita consultas por organização e RestaurantScope; OrderPolicy valida approve_customer_orders no restaurante do pedido. ApproveOrderAction e RejectOrderAction usam transação e lockForUpdate no mesmo pedido, com nova checagem de elegibilidade sob o lock: uma segunda transição recebe 409. Nenhuma falha comprovada exigiu mudar o backend. A suíte existente testa duas aprovações sequenciais; **não representa corrida real entre dois processos PostgreSQL**.

A trava frontend agora é compartilhada entre instâncias e por pedido, cobrindo approve/reject sem bloquear pedidos diferentes. 404/409 mantêm refetch; 403 permanece erro e não concede autorização; 401/419 continuam no tratamento central existente. Não há retry automático do POST nem estado otimista inventado. Se POST/GET perderem conexão, o marcador de incerteza exige leitura bem-sucedida antes de outra escrita.

Na UI, pedidos confirmed e demais estados fora de waiting_approval não passam pela elegibilidade. A consulta backend por sessão e o descarte de respostas antigas preservam o contexto selecionado.

## Verificação técnica do ambiente habitual

- SPA existente reutilizada em `http://localhost:5174`; chamadas reais observadas para `http://localhost:8080`.
- API local no container `restaurants-api-laravel.test-1`, bind mount deste checkout em `/var/www/html`, APP_ENV=local, PostgreSQL `pgsql:5432/laravel`, sem cache de configuração substituindo o destino.
- PostgreSQL confirmou `current_database=laravel`, servidor `172.19.0.3:5432`; esse IP coincide com o container local `restaurants-api-pgsql-1`. Não foi usado Supabase nem banco temporário para declarar integração real.
- Waiter existente: usuário **5**, `waiter1@aforo.test`, ativo, com approve_customer_orders no restaurante **1 / AFORO Malvarrosa**. Identidade, senha de seed atual e permission conferidas antes do uso, sem alterar contas/papéis.
- Conta negativa existente: usuário **9**, `kitchen1@aforo.test`, ativo, sem approve_customer_orders nesse restaurante.
- Inspeção de actions/eventos: aprovação registra auditoria/atividade e evento operacional enfileirado. Nenhum listener de e-mail/WhatsApp encontrado para essa aprovação; nenhum envio externo foi executado. Mail local é log e fila é database.

A migration e o .env corrigidos na etapa anterior foram apenas verificados como contexto; não foram refeitos nem editados.

## Validação real no navegador

agent-browser, cookies Sanctum reais e API/banco habituais, sem adapter HTTP de teste:

1. Estado inicial reconfirmado: restaurante 1, Mesa **11**, sessão **490** occupied, pedido **654**, customer_qr, waiting_approval, approved_at=null.
2. Login do waiter existente, restaurante correto e abertura da mesa em `/app/service`.
3. Lista e detalhe do drawer mostraram #654, **1× Hamburguesa AFORO TEST**, **13,50 €**, nota do item **“PRUEBA LOCAL QR — no preparar.”** e Aprobar.
4. Login da cozinha em sessão independente: sem CTA. Tentativa explícita do endpoint pelo cliente HTTP autenticado real retornou **403** antes da aprovação; #654 permaneceu pendente.
5. Aprovação acionada no botão existente do detalhe interno pelo navegador (`HTMLElement.click()` via agent-browser eval; não foi chamada diretamente a action/service para a aprovação positiva). Um observador de XHR somente registrou a resposta, sem interceptar ou substituir transporte. Os comandos nativos click/Enter da ferramenta não haviam produzido POST; somente o acionamento DOM produziu a chamada observada.
6. Exatamente **um POST /api/v1/orders/654/approve → 200**. Corpo retornou id=654, status=confirmed, approved_by_user_id=5 e **approved_at=2026-10-21T07:52:01.000000Z** (**09:52:01 Europe/Madrid**).
7. Fila pendente retornou `[]`; histórico da sessão 490 retornou **[{id:654,status:confirmed}]**. Drawer manteve o pedido, mostrou Confirmado e removeu Aprobar; operação mudou para En cocina, com total atual **13,50 €** segundo a regra backend vigente.
8. Consulta autenticada da cozinha retornou #654/confirmed. Após refetch, a UI mostrou **Nuevos 1**, Mesa 11 e detalhe #654; Aceptar pedido estava disponível e **não foi acionado**.
9. Banco confirmou exatamente **uma auditoria order.approved** para #654. accepted_at, preparing_at, ready_at, served_at e cancelled_at continuam null. Sessão 490 continua occupied/unpaid, closed_at=null, **zero payment_records**.

A aprovação real de #654 ocorreu antes do último ajuste da trava compartilhada; esse ajuste final foi validado nos componentes montados e o estado real confirmed foi conferido novamente com o código final. Não foi criado outro pedido nem regredido #654 para repetir a mutação.

## UX e evidências visuais

Skill local usada: `.claude/skills/ui-ux-pro-max/SKILL.md`; design system e instruções CLAUDE lidos. Nenhum layout/token/texto novo foi necessário; os três idiomas existentes foram reutilizados.

Checks montados: 375×812, 768×1024, 1024×768 e 1440×900, light/dark, es-ES/ca-ES-valencia/en-GB. CTA com altura **44 px**, sem overflow horizontal; sheet longo com 30 itens manteve footer acessível e ação funcional.

No drawer real, inspecionado em light/dark:

- 375×812: Aprobar em x=21, y=673.9375, largura=103.703125 e altura=44; hit-test positivo, dentro da viewport após scroll normal.
- 768×1024: x=381, y=756.125, largura=103.703125 e altura=44; hit-test positivo e focus-visible observado com navegação por teclado.
- Item, quantidade, nota e total legíveis; ação no próprio drawer, sem modal extra. Nenhum erro de página observado nas sessões reais.

Capturas temporárias inspecionadas fora dos repositórios: `/tmp/qr-popup-real-375-light.png`, `/tmp/qr-popup-real-375-dark.png`, `/tmp/qr-popup-real-768-light.png`, `/tmp/qr-popup-real-768-dark.png`, `/tmp/qr-popup-real-confirmed-768.png`, `/tmp/qr-popup-real-history-654.png` e `/tmp/qr-popup-real-kitchen-654.png`. Não são artefatos permanentes/versionados.

## Testes e checks

Antes de qualquer suíte backend, conexão Laravel com DB_DATABASE=testing/DB_URL vazio confirmou **pgsql → 172.19.0.3:5432/testing**, distinto de laravel; banco testing local já existia. Nenhuma suíte backend foi executada em paralelo. RefreshDatabase foi usado somente no banco isolado testing, nunca no habitual.

| Check | Resultado |
| --- | --- |
| `docker exec -e DB_DATABASE=testing -e DB_URL= restaurants-api-laravel.test-1 php artisan test --filter='OrderApprovalTest|OrderLifecycleTest|OrderDetailContractTest|TransferPostConditionsTest|KitchenQueueTest|CollectionPermissionBoundaryTest'` | **53 testes, 223 asserções, passaram** |
| `LD_LIBRARY_PATH=/tmp/qr-browser-libs/extracted/usr/lib/x86_64-linux-gnu APPROVAL_TEST_BASE_URL=http://localhost:5174/ node tests/frontend-approvals.mjs` | **83 checks montados + 48 responsivos**, sem erros de página |
| `npm run build` | **Passou**; inclui `vue-tsc -b` e Vite build development |
| `npm run test:security` | **54 checks**, passaram; doubles locais, guard components placeholders |
| `vendor/bin/pint --test app/Actions/Orders/ApproveOrderAction.php app/Actions/Orders/RejectOrderAction.php app/Policies/OrderPolicy.php` no container | **3 arquivos passaram**, sem escrita |
| `git diff --check -- src/composables/useOrderApprovals.ts src/components/dashboard/table/TableOrdersList.vue src/views/service/ServiceView.vue` | Passou |
| `node --check tests/frontend-approvals.mjs` | Passou |

Sem script lint frontend no package.json; não foi inventado. Não foram ampliadas suítes não relacionadas para corrigir dívida anterior. Bibliotecas de browser já disponíveis em /tmp foram reutilizadas; nenhum pacote do sistema foi instalado. A suíte de aprovação reutilizou o Vite habitual; a suíte de segurança existente geriu e encerrou seu próprio servidor efêmero de fixtures.

Cobertura: permission/status/origin, isolamento por restaurante/sessão, consultas de outro restaurante negadas, clique repetido, approve/reject simultâneos, instâncias diferentes, histórico e callback operacional, 404/409/403/401/419, falha antes/depois de commit, reconciliação indisponível, respostas atrasadas de GET/POST e troca A→B→A, rejeição com confirmação, refetch e eventos simulados de criação/status. **Fixtures/mocks não comprovam broadcast ou integração real**; essa distinção vale também para a suíte de segurança.

Logs temporários: `/tmp/qr-popup-approval-final.log`, `/tmp/qr-popup-approval-backend.log`, `/tmp/qr-popup-approval-build-final.log`, `/tmp/qr-popup-approval-security.log`, `/tmp/qr-popup-approval-pint.log`.

## Reverb e pendência

**Entrega realtime real pendente.** A configuração habitual aponta a localhost:8081, mas a conexão foi resetada (HTTP 000); não havia processo reverb nem queue worker no container. Port mapping Docker não comprova serviço em execução. Nenhuma infraestrutura, Reverb, Redis, fila ou configuração foi alterada para contornar isso, e jobs não foram processados manualmente.

Criação/status/reconexão e ausência de duplicidade via eventos foram exercitados somente com transporte simulado na suíte existente. O ambiente real demonstrou os refetches HTTP após aprovação e a recuperação da cozinha por atualização; não foi demonstrada entrega automática a outra tela por Reverb. Não foi criado um novo pedido real apenas para esse teste indisponível.

Esta é a pendência para encerrar integralmente a validação de realtime: usar Reverb e worker habituais respondendo e verificar order.created/order.status_changed em outra sessão. Não há bloqueio de credenciais ou permissões para o fluxo principal validado.

## Estado final e teste manual

Serviços preexistentes preservados. Frontend 5174/API 8080 continuam disponíveis. Mesa 11/sessão 490 aberta e unpaid; #654 confirmed/aprovado pelo usuário 5, sem aceite/preparo/serviço/pagamento/encerramento. A aprovação pode deixar seu broadcast normal na fila habitual, pois não há worker ativo. Nenhum commit, push, deploy, edição de .env, mudança de permissão, alteração de infraestrutura ou regressão manual de estado foi feita.

Para conferir:

1. Abrir `http://localhost:5174`, entrar com o waiter local e selecionar AFORO Malvarrosa.
2. Servicio → Mesa 11 → #654: Confirmado, item/nota/total preservados e nenhum Aprobar; fila pendente vazia.
3. Na cozinha, atualizar e abrir Nuevos: #654 aparece; não tocar Aceptar pedido nesta etapa.
4. Para repetir uma aprovação, criar pelo QR outro pedido **exclusivamente local** marcado “PRUEBA LOCAL — no preparar”, revisar/aprovar no drawer; nunca regredir #654.

## Git — estado completo, incluindo trabalho anterior

As capturas abaixo são do workspace inteiro. Não atribuir o diff completo a esta tarefa: a API já tinha QR/segurança/staging em andamento e o frontend já continha aprovação, QR, catálogo e hardening. Untracked não entram em git diff --stat.

### restaurants-api

Branch: `fix/security-hardening`.

`git status --short`

```text
 M app/Actions/Orders/CreatePublicOrderAction.php
 M app/Actions/Orders/OrderCreationService.php
 M app/Actions/Public/ResolvePublicTableAction.php
 M app/Actions/TableRequests/CreatePublicTableRequestAction.php
 M app/Actions/Tables/OpenTableAction.php
 M app/Http/Controllers/Api/V1/Public/PublicMenuController.php
 M app/Http/Controllers/Api/V1/Public/PublicOrderController.php
 M app/Http/Controllers/Api/V1/Public/PublicTableController.php
 M app/Http/Controllers/Api/V1/Public/PublicTableRequestController.php
 M app/Http/Resources/Api/V1/Public/PublicSessionStateResource.php
 M app/Models/TableSession.php
 M app/Models/UserRole.php
 M app/OpenApi/ApiDocumentation.php
 M app/Providers/AppServiceProvider.php
 M bootstrap/app.php
 M package.json
 M routes/api.php
 M tests/Feature/Activity/ActivityRecordingTest.php
 M tests/Feature/AuditLog/AuditLogTableSessionAndRequestTest.php
 M tests/Feature/Order/ModifierSelectionTest.php
 M tests/Feature/Order/OrderPricingTest.php
 M tests/Feature/Public/PublicBillRequestEligibilityTest.php
 M tests/Feature/Public/PublicCsrfOriginTest.php
 M tests/Feature/Public/PublicFeedbackTest.php
 M tests/Feature/Public/PublicOrderBillRequestedTest.php
 M tests/Feature/Public/PublicOrderIdempotencyTest.php
 M tests/Feature/Public/PublicOrderRateLimitTest.php
 M tests/Feature/Public/PublicOrderTest.php
 M tests/Feature/Public/PublicTableRequestRateLimitTest.php
 M tests/Feature/Public/PublicTableRequestTest.php
 M tests/Feature/RestaurantSettings/FeatureTogglesTest.php
 M tests/Feature/Security/PublicAbuseTest.php
 M tests/Feature/Security/SecurityCloseoutTest.php
 M tests/Feature/TableRequest/TableRequestLifecycleTest.php
 M tests/Feature/TableSession/PaidSessionBlocksTest.php
?? .env.staging.example
?? .oh-my-sdd/
?? app/Actions/Public/EnterPublicTableAction.php
?? app/Exceptions/Public/PublicVisitInvalidException.php
?? database/migrations/2026_10_21_000001_allow_public_table_session_opening.php
?? docs/QR-auto-open-report.md
?? docs/QR-local-validation-report.md
?? docs/pre-9.2-manager-permissions.md
?? package-lock.json
?? tests/Concerns/InteractsWithPublicVisits.php
?? tests/Feature/Public/PublicTableEntryConcurrencyTest.php
?? tests/Feature/Public/PublicTableEntryTest.php
?? tests/Support/
```

`git diff --stat`

```text
 app/Actions/Orders/CreatePublicOrderAction.php     | 12 ++++--
 app/Actions/Orders/OrderCreationService.php        |  3 +-
 app/Actions/Public/ResolvePublicTableAction.php    | 20 ++++++++-
 .../CreatePublicTableRequestAction.php             |  9 ++--
 app/Actions/Tables/OpenTableAction.php             | 19 +++++---
 .../Api/V1/Public/PublicMenuController.php         |  4 +-
 .../Api/V1/Public/PublicOrderController.php        |  3 +-
 .../Api/V1/Public/PublicTableController.php        | 35 +++++++++++++--
 .../Api/V1/Public/PublicTableRequestController.php |  4 +-
 .../Api/V1/Public/PublicSessionStateResource.php   | 17 ++++----
 app/Models/TableSession.php                        | 13 ++----
 app/Models/UserRole.php                            |  2 +-
 app/OpenApi/ApiDocumentation.php                   |  2 +-
 app/Providers/AppServiceProvider.php               |  7 +++
 bootstrap/app.php                                  |  6 +++
 package.json                                       |  3 ++
 routes/api.php                                     |  3 ++
 tests/Feature/Activity/ActivityRecordingTest.php   |  6 ++-
 .../AuditLogTableSessionAndRequestTest.php         |  4 +-
 tests/Feature/Order/ModifierSelectionTest.php      |  4 +-
 tests/Feature/Order/OrderPricingTest.php           | 10 +++--
 .../Public/PublicBillRequestEligibilityTest.php    | 10 +++--
 tests/Feature/Public/PublicCsrfOriginTest.php      |  8 ++--
 tests/Feature/Public/PublicFeedbackTest.php        |  6 +--
 .../Public/PublicOrderBillRequestedTest.php        | 12 +++---
 .../Feature/Public/PublicOrderIdempotencyTest.php  | 50 +++++++++++-----------
 tests/Feature/Public/PublicOrderRateLimitTest.php  |  8 ++--
 tests/Feature/Public/PublicOrderTest.php           | 32 +++++++-------
 .../Public/PublicTableRequestRateLimitTest.php     | 12 +++---
 tests/Feature/Public/PublicTableRequestTest.php    | 46 ++++++++++----------
 .../RestaurantSettings/FeatureTogglesTest.php      | 18 ++++----
 tests/Feature/Security/PublicAbuseTest.php         | 16 ++++---
 tests/Feature/Security/SecurityCloseoutTest.php    |  6 ++-
 .../TableRequest/TableRequestLifecycleTest.php     |  4 +-
 .../Feature/TableSession/PaidSessionBlocksTest.php | 24 ++++++-----
 35 files changed, 275 insertions(+), 163 deletions(-)
```


### restaurants-web

Branch: `main`.

`git status --short`

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
 M src/components/public/PublicPostVisitView.vue
 M src/components/public/PublicProductFeed.vue
 M src/components/service/OrderDetailSheet.vue
 M src/composables/useOrderApprovals.ts
 M src/composables/usePublicEntryState.ts
 M src/composables/usePublicMenu.ts
 M src/composables/usePublicTableResolution.ts
 M src/config/env.ts
 M src/config/runtime.ts
 M src/i18n/locales/ca-ES-valencia.ts
 M src/i18n/locales/en-GB.ts
 M src/i18n/locales/es-ES.ts
 M src/main.ts
 M src/realtime/echo.ts
 M src/services/product.service.ts
 M src/services/public-table.service.ts
 M src/utils/error-message.ts
 M src/utils/table-public-url.ts
 M src/views/LoginView.vue
 M src/views/public/PublicTableView.vue
 M src/views/service/ServiceView.vue
 M tests/frontend-hardening-build.mjs
 M tests/frontend-hardening.mjs
 M tests/frontend-security.browser.ts
 M vite.config.ts
?? .claude/skills/ui-ux-pro-max/scripts/__pycache__/
?? docs/QR-auto-open-report.md
?? docs/QR-popup-approval-validation-report.md
?? docs/QR-waiter-approval-fix-report.md
?? src/assets/images/aforro-agency-restauramt-pexels-imgs.jpg:Zone.Identifier
?? "src/assets/images/ref/imagem 1.jpg:Zone.Identifier"
?? "src/assets/images/ref/imagem 2.webp:Zone.Identifier"
?? "src/assets/images/ref/imagem 3.png:Zone.Identifier"
?? src/components/public/PublicMenuCatalog.vue
?? src/utils/order-approval.ts
?? src/utils/public-visit-context.ts
?? src/views/aforo-dashboard.html:Zone.Identifier
?? t.txt
?? tests/frontend-approvals.browser.ts
?? tests/frontend-approvals.html
?? tests/frontend-approvals.mjs
?? tests/frontend-qr-entry.browser.ts
?? tests/frontend-qr-entry.html
?? tests/frontend-qr-entry.mjs
```

`git diff --stat`

```text
 .env.example                                       |   58 +-
 docs/PR-2B-frontend-hardening-report.md            |  452 +-
 ...PR-2B.1-frontend-hardening-correction-report.md |  306 +-
 package-lock.json                                  | 7033 ++++++++++----------
 package.json                                       |   78 +-
 src/api/errors.ts                                  |  206 +-
 src/api/http.ts                                    |   36 +-
 src/api/public-http.ts                             |   40 +-
 src/api/retry-after.ts                             |   16 +-
 src/api/session.ts                                 |   26 +-
 src/api/timeouts.ts                                |    4 +-
 .../dashboard/table/TableDetailsDrawer.vue         |    1 +
 src/components/dashboard/table/TableOrdersList.vue |   61 +-
 src/components/public/PublicPostVisitView.vue      |    4 +
 src/components/public/PublicProductFeed.vue        |   17 +-
 src/components/service/OrderDetailSheet.vue        |   18 +-
 src/composables/useOrderApprovals.ts               |  122 +-
 src/composables/usePublicEntryState.ts             |    7 +
 src/composables/usePublicMenu.ts                   |    5 +-
 src/composables/usePublicTableResolution.ts        |   44 +-
 src/config/env.ts                                  |   82 +-
 src/config/runtime.ts                              |    4 +-
 src/i18n/locales/ca-ES-valencia.ts                 | 3224 ++++-----
 src/i18n/locales/en-GB.ts                          | 3224 ++++-----
 src/i18n/locales/es-ES.ts                          | 3238 ++++-----
 src/main.ts                                        |   64 +-
 src/realtime/echo.ts                               |  144 +-
 src/services/product.service.ts                    |  148 +-
 src/services/public-table.service.ts               |   19 +-
 src/utils/error-message.ts                         |    1 +
 src/utils/table-public-url.ts                      |   70 +-
 src/views/LoginView.vue                            |  500 +-
 src/views/public/PublicTableView.vue               |  335 +-
 src/views/service/ServiceView.vue                  |   66 +-
 tests/frontend-hardening-build.mjs                 |  154 +-
 tests/frontend-hardening.mjs                       |  270 +-
 tests/frontend-security.browser.ts                 |    2 +-
 vite.config.ts                                     |   56 +-
 38 files changed, 10270 insertions(+), 9865 deletions(-)
```

