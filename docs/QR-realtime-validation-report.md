# QR — realtime, estado de conexão e fallback: diagnóstico e validação local

21 de outubro de 2026 · Europe/Madrid. **Sem commit, push ou deploy.**

## Resultado e limite da entrega

Corrigidos o indicador sem prazo de diagnóstico, a identificação prematura de conexão saudável e a ausência de atualização automática quando o realtime cai. Reverb e worker locais estão ativos; criação QR → broadcast real → refetch → fila/drawer foi demonstrada, inclusive com o código final. Queda, fallback e reconexão também foram demonstrados no ambiente habitual.

**A validação completa criação → aprovação por clique normal → evento de status → cozinha permanece pendente.** Os comandos nativos da ferramenta não acionaram os controles autenticados; houve **zero POST positivo de aprovação**. Não se substituiu essa prova por `HTMLElement.click()`, `dispatchEvent`, chamada do service/action ou mudança direta no banco. A criação pela tela pública funcionou com cliques normais. O drawer foi aberto pelo deep link existente; o clique para entrar no detalhe interno também ficou limitado pela ferramenta. Há um procedimento manual no fim deste relatório.

Pedidos locais criados nesta tarefa: **#655, #656, #657 e #658**, todos na **Mesa 11 / sessão 490 / restaurante 1**, ainda `customer_qr/waiting_approval`. Foram usados para a primeira entrega, atualização durante a queda, entrega após reconexão e repetição após remover uma leitura duplicada. Cada pedido tem 1× Hamburguesa AFORO TEST, 13,50 €, com nota **no item** iniciada por “PRUEBA LOCAL REALTIME — no preparar.” Não são pedidos de produção nem devem ser preparados.

**#654 foi preservado:** `confirmed`, aprovado pelo usuário 5 às 07:52:01 UTC / 09:52:01 Europe/Madrid na etapa anterior, sem aceite/preparo/serviço/pagamento. Não se regrediu nenhum estado.

## Causas comprovadas

1. **Ausência de entrega:** não havia processo Reverb nem worker no container. A porta 8081 estava publicada pelo Docker, mas a conexão era resetada (`HTTP 000`); isso não constituía um serviço WebSocket ativo. Os broadcasts eram enfileirados em `database/default` e permaneciam pendentes. Iniciar os dois processos, mantendo host/porta/scheme/origens e credenciais existentes, permitiu autorização e entrega reais. Não foi necessário alterar Docker, Redis ou os canais.
2. **“Conectando” sem diagnóstico conclusivo:** `useRestaurantRealtime` repassava o estado bruto `connecting` em cada tentativa do SDK, mapeava `unavailable` para `reconnecting` e não tinha um prazo fixo para declarar indisponibilidade. Assim, tentativas do transporte podiam continuar se apresentando como nova conexão/reconexão sem um diagnóstico estável. Não se afirma que o SDK tenha ficado continuamente no mesmo estado bruto durante toda a observação do usuário.
3. **Indicador antecipado:** o socket `connected` era suficiente para mostrar conectado, mesmo antes de confirmar a assinatura privada. Agora é preciso receber sucesso de assinatura do canal do restaurante ativo.
4. **Sem fallback operacional:** Servicio/Dashboard/Cozinha só refaziam consultas por eventos, ações ou atualização manual. Sem socket/eventos, a tela não se reconciliava automaticamente.
5. **Erro de auth perdia contexto:** o caminho de authorizer customizado do Pusher descarta o status do Axios no `subscription_error`. Agora status e `Retry-After` normalizados são preservados separadamente, com descarte de tentativas antigas. Isso evita tratar uma negação 403 como indisponibilidade transitória e tentar autorizar indefinidamente.
6. **Consulta redundante:** com drawer aberto, o refresh da sessão também refazia a fila pendente na instância interna de `useOrderApprovals`. A fila já tem um proprietário em Servicio. Esse watcher foi removido; notificações de mutação do drawer passaram pelo mesmo agendador de refresh da tela.

O Pusher documenta que `connecting` também ocorre durante reconexões; a conexão do transporte e o sucesso de assinatura são sinais distintos. Referências consultadas: [estados de conexão](https://pusher.com/docs/channels/using_channels/connection/) e [eventos de assinatura](https://pusher.com/docs/channels/using_channels/events/). A semântica efetivamente usada também foi conferida nas dependências instaladas.

## Caminho end-to-end preservado

`CreatePublicOrderAction` → `OrderCreationService` / transação → `OrderCreated` → `ShouldDispatchAfterCommit` → `BroadcastEvent` em `database/realtime-local` → worker → publicação HTTP no Reverb, dentro do container em `localhost:8081` → WebSocket do navegador em `ws://localhost:8081` → autenticação Sanctum em `/broadcasting/auth` → assinatura de `private-restaurant.1` → handler `.order.created` → invalidação coalescida → leituras REST autoritativas → fila, operações e histórico da sessão.

Aprovação continua sendo `ApproveOrderAction` / `OrderStatusChanged`, com `waiting_approval → confirmed`. A implementação e os testes dessa transição foram preservados. O trecho positivo real dessa sequência não foi acionado nesta tarefa. `/accept` é outra ação; não foi chamado.

Eventos continuam pequenos e não substituem snapshots por dados incompletos. A cozinha recebe a invalidação operacional mínima no canal do restaurante, conforme contrato existente; `GET /kitchen/orders` não retorna os pedidos pendentes nem seus itens para a tela da cozinha. A resposta real final foi somente `[{id:654,status:confirmed}]`.

## Correções por arquivo

### restaurants-api

- `config/broadcasting.php`: opção de fila `BROADCAST_QUEUE`, sem alterar a conexão/driver existente. Ausente a opção, permanece o comportamento anterior de fila padrão.
- `app/Events/Realtime/RealtimeEvent.php`: `broadcastQueue()` aplica a opção aos eventos operacionais existentes. After-commit, canais, payloads, actions e policies não mudaram.
- `tests/Feature/Realtime/EventPayloadContractTest.php`: verifica pelo `BroadcastManager`/fila fake o destino dedicado e o comportamento padrão quando a opção está ausente.
- `.env` local, ignorado pelo Git: acrescentadas apenas a configuração `BROADCAST_QUEUE=realtime-local`, uma linha em branco e seu comentário. O prefixo anterior foi comparado byte a byte e preservado. Nenhum secret foi impresso.

### restaurants-web

- `src/realtime/echo.ts`: mesmo singleton Echo e cliente HTTP/Sanctum/CSRF; preservação de erros normalizados de autorização, proteção contra respostas antigas e limpeza no logout. Mensagens técnicas do authorizer são genéricas.
- `src/composables/useRestaurantRealtime.ts`: assinatura confirmada, prazo fixo, reconexão, deduplicação por `event_id`, contexto/geração, descarte de canal/payload antigo, fallback e agendador único de refresh. Expõe a origem do refresh para diagnóstico/testes sem acrescentar detalhes técnicos ao produto.
- `src/composables/useRestaurantOperations.ts`: refetch aguardável e erro do refresh de fundo disponível para o controle de intervalo/rate limit.
- `src/views/service/ServiceView.vue`: indicador existente traduzido, refresh aguardável da tela e coalescência de mutação/evento/atualização manual.
- `src/views/kitchen/KitchenView.vue` e `src/views/DashboardView.vue`: leituras autoritativas ligadas ao mesmo mecanismo, aguardando as consultas da tela.
- `src/components/dashboard/table/TableOrdersList.vue`: removido o refetch redundante da fila pendente por `refreshKey`; histórico e detalhe continuam usando suas consultas existentes. Trava compartilhada de aprovação, reconciliação de falhas de rede e proteção de sessão da tarefa anterior foram preservadas.
- `src/i18n/locales/{es-ES,ca-ES-valencia,en-GB}.ts`: hint informa atualização automática e possibilidade de atualizar manualmente; terminadores CRLF anteriores foram preservados.
- `tests/frontend-realtime.{browser.ts,html,mjs}`: novos testes montados de conexão/fallback com transporte e relógio simulados.
- `tests/frontend-approvals.browser.ts`: adapter de transporte com envelope real, espera da coalescência e regressão que verifica histórico atualizado sem repetir a leitura da fila do pai.
- `docs/QR-realtime-validation-report.md`: este relatório.

Não foram alterados `package.json`, dependências, drivers, staging, Supabase, templates de segurança, credenciais, papéis, permissões ou infraestrutura. Não houve implementação de atribuição automática de garçons.

## Comportamento de conexão e fallback

- `connecting`: primeira tentativa de transporte/assinatura.
- `connected`: socket conectado **e** canal privado assinado com sucesso.
- `reconnecting`: perda de uma assinatura anteriormente saudável, durante a tentativa de recuperação.
- `unavailable`: sem configuração, offline/falha do transporte ou prazo de diagnóstico de **10 s** excedido. Tentativas seguintes não reiniciam esse prazo continuamente.
- `error`: falha de assinatura/autorização; não é sobrescrita por um simples socket conectado.
- `disconnected`: contexto desabilitado/sem restaurante.

A reconexão do socket continua sob o backoff do Pusher, sem criar Echo por componente nem chamar `connect()` em loop. Reautorização transitória usa espera de 15/30/60/120 s, respeitando `Retry-After`; 401/403/419 não disparam esse retry. O tratamento central de sessão permanece vigente.

O fallback começa em **15 s**, agenda a próxima consulta depois de concluir a anterior, e reduz a frequência em erro até 120 s. Respeita `Retry-After`, pausa com aba oculta/rede offline e reconcilia ao recuperar visibilidade/foco/rede. Erros de autorização nas leituras interrompem o fallback. Timers/listeners são limpos ao sair, desabilitar a tela ou trocar restaurante. Uma resposta antiga não controla o intervalo do contexto novo.

A assinatura/reassinatura invalida as leituras e desliga o polling enquanto o canal está saudável. Eventos repetidos são deduplicados e bursts são coalescidos em 250 ms. O polling público anterior de resolução/conta, em outro contexto e com outra finalidade, foi inspecionado e preservado; não se criou um segundo polling para ele.

O indicador comprova transporte/canal. O worker precisa continuar ativo para entregar os broadcasts enfileirados; uma API HTTP saudável, isoladamente, não torna o indicador conectado.

## Ambiente, segurança e preservação das filas

Conferido antes de iniciar processos:

- Frontend habitual `http://localhost:5174`, Vite preexistente PID host **158538**.
- API habitual `http://localhost:8080`, container `restaurants-api-laravel.test-1`, bind mount deste checkout em `/var/www/html`, `APP_ENV=local`, sem cache de configuração.
- PostgreSQL da aplicação: **laravel**, servidor **172.19.0.3:5432**, igual ao IP do container local `restaurants-api-pgsql-1`. Não é Supabase.
- Fila/cache/sessão continuam **database**. Redis preexistente não foi trocado/configurado para atender esta tarefa; scaling do Reverb não foi habilitado.
- Reverb: publicação `localhost:8081/http`, escuta interna `0.0.0.0:8081`, mapeamento Docker já existente. Origem permitida continua `localhost`, sem wildcard.
- Waiter **5 / waiter1@aforo.test**, ativo, com `approve_customer_orders` no restaurante 1; cozinha **9 / kitchen1@aforo.test**, ativa, sem essa permissão. Senha de seed foi validada contra os hashes existentes, sem alterar contas ou imprimir a senha.

A inspeção dos jobs leu JSON/metadados e nomes de classes, sem `unserialize`, extração para execução ou impressão de payloads. Havia **284 jobs**, IDs **347–630**, todos em `default`, classes `Illuminate\Broadcasting\BroadcastEvent` para eventos operacionais/atividade. **Nenhum job de e-mail, WhatsApp ou outro efeito externo foi encontrado nessa inspeção.** Havia 1 failed job preexistente.

Como não havia fila separada, optou-se por separar **somente novos broadcasts** com a opção local reversível, preservando o backlog histórico. O worker nunca consumiu `default`. Verificação final dos IDs antigos: **284 presentes, `attempts` somado = 0, zero reservados**. A fila `realtime-local` foi drenada normalmente após as publicações; `failed_jobs` continuou com **1**.

O primeiro worker desta tarefa usou 3 tentativas. Antes do teste de queda, somente esse worker foi substituído por um worker dedicado com `--tries=0 --backoff=10`, para que broadcasts locais aguardassem a retomada do Reverb sem virarem failed jobs permanentes. Os logs `FAIL` durante a queda representam tentativas transitórias; esses jobs foram publicados depois. Não se apagou, reexecutou manualmente ou moveu nenhum job antigo.

Não se iniciou scheduler nem worker genérico. Não se alterou a conexão de fila para Redis. Não se enviaram mensagens externas.

Segurança real: waiter e cozinha obtiveram **200** em `/broadcasting/auth` para o restaurante 1 e **403** para o restaurante 2, fora de seu escopo. Testes backend também cobrem outra organização, guest, restaurante inexistente e organização suspensa. Não foram ampliadas origens ou permissões nem tornados canais públicos. App secret continua exclusivamente no backend.

## Evidências reais e separação dos mecanismos

As sessões de navegador foram independentes: cliente anônimo QR, waiter e cozinha. Uma segunda sessão do mesmo waiter manteve o drawer aberto para observar fila e histórico. Não houve adapter HTTP de fixtures nessas sessões.

| Cenário | Evidência observada |
| --- | --- |
| Primeira entrega, #655 | `order.created` recebido em waiter/cozinha às **08:22:02.396 UTC**; GETs autoritativos cerca de 250 ms depois; fila ganhou #655 sem refresh. Cozinha continuou com somente #654. |
| Queda com #656 | Reverb desta tarefa parado às **08:32:22 UTC**. UI mostrou Reconectando e, após o prazo, indisponível. Clique normal público enviou **um POST → 201** às 08:32:25; #656 apareceu no waiter por polling enquanto o Reverb continuava parado. |
| Retomada | Broadcasts locais aguardaram retry; Reverb reiniciado, assinatura privada voltou e houve refetch de reconciliação. Não se atribui entrega WebSocket de #656 à janela em que o cliente estava desconectado: a publicação ocorreu antes da reassinatura observada. |
| Pós-reconexão, #657 | Evento real `order.created` em **08:36:36.385 UTC**, seguido de leitura em ~250 ms. A captura encontrou a consulta duplicada do drawer, removida em seguida. |
| **Código final, #658** | Clique público normal, evento `e56fe039-2be0-4691-b229-4143257fc49b` em **08:44:17.759 UTC / 10:44:17.759 Madrid**, canal `private-restaurant.1`, recebido nas sessões do waiter e cozinha. |
| Refetch final de #658 | Drawer: **uma** consulta à fila pendente às 08:44:18.020, mais operações/histórico/conta/solicitações existentes. Não repetiu a fila após mudar o snapshot. Cozinha: uma leitura de pedidos e uma de dashboard, iniciadas às 08:44:18.016. |
| Segundo ciclo, código final | Reverb parado novamente, UI indisponível e fallback mantiveram os quatro pendentes e #654 no histórico. Reverb reiniciado; reconexão/reassinatura e reconciliação automáticas observadas até **08:46:04 UTC**. Cada ID continuou uma vez por lista. |
| Aprovação normal | Comandos `click`, foco/Enter, mouse e tentativas de entrada nativa via CDP não acionaram a aprovação na área autenticada. **Zero POST /approve**, zero auditoria de aprovação para #655–#658. **Não validada positivamente.** |
| Status na cozinha | Nenhum novo pedido foi aprovado; portanto, entrega real de `order.status_changed` e aparecimento automático de um novo `confirmed` na cozinha **não foram comprovados nesta tarefa**. Fixtures e testes backend cobrem esse caminho, mas não substituem a prova real. |

Os observadores CDP somente registraram frames/respostas e metadados selecionados; não interceptaram nem substituíram transporte. Não foram registrados cookies, tokens, assinaturas ou payloads completos. A prova final usa um frame WebSocket recebido **antes** das leituras, com canal saudável e fallback desligado; a prova de #656 usa serviço WebSocket parado e polling ativo. São evidências diferentes.

A investigação da entrada tentou perfis novos, WebMCP desabilitado e outro Chromium já instalado, sem obter a ação autenticada. Não se atribui uma causa definitiva ao problema da ferramenta, nem se declara um defeito funcional do botão somente por essa limitação. Nenhum browser/sistema foi instalado para contornar o problema.

## UX e testes

Skill local aplicada: `.claude/skills/ui-ux-pro-max/SKILL.md`; instruções de `CLAUDE.md` e design system consultadas. Indicador textual reutiliza traduções e tokens existentes. Inspeção real em mobile 375×812 e cozinha 768×1024; drawer em light/dark, sem overflow horizontal. Nenhum erro de página nas quatro sessões reais. Não se redesenhou o layout.

Antes das suítes backend, Laravel com `DB_DATABASE=testing` e `DB_URL` vazio confirmou **testing → 172.19.0.3:5432**, distinto de `laravel`. Não houve suítes backend concorrentes nem criação/recriação do banco habitual. RefreshDatabase ficou restrito ao banco de testes preexistente.

| Check final | Resultado |
| --- | --- |
| Suíte backend focada (comando exato abaixo) | **82 testes / 209 asserções**, passaram |
| `LD_LIBRARY_PATH=/tmp/qr-browser-libs/extracted/usr/lib/x86_64-linux-gnu REALTIME_TEST_BASE_URL=http://localhost:5174 node tests/frontend-realtime.mjs` | **35 checks montados**, máximo de uma leitura simultânea no scheduler; sem erros de página |
| `LD_LIBRARY_PATH=/tmp/qr-browser-libs/extracted/usr/lib/x86_64-linux-gnu APPROVAL_TEST_BASE_URL=http://localhost:5174 node tests/frontend-approvals.mjs` | **85 checks montados + 48 responsivos**, passaram; quatro viewports, light/dark, três idiomas |
| `LD_LIBRARY_PATH=/tmp/qr-browser-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:security` | **54 checks**, passaram; doubles locais e guard components placeholders |
| `npm run build` | Passou: TypeScript da aplicação (`vue-tsc -b`) e Vite build development |
| `vendor/bin/pint --test app/Events/Realtime/RealtimeEvent.php config/broadcasting.php tests/Feature/Realtime/EventPayloadContractTest.php` no container | 3 arquivos passaram; Pint somente corrigiu ordem de imports no teste alterado |
| `git -c core.whitespace=cr-at-eol diff --check -- <arquivos frontend alterados>` e `git diff --check -- <três arquivos backend>` | Passaram; CRLF preexistente tratado como terminador válido |
| `node --check tests/frontend-realtime.mjs` | Passou |

Os 35 checks usam transporte/HTTP/relógio simulados e o composable de produção: prazo inicial, assinatura, custom authorizer 403, recuperação, eventos duplicados/outro tenant, A→B→A, callbacks atrasados, slow reads/fallback sem sobreposição, 429/Retry-After, offline/online/visibilidade, autorização perdida, desabilitação/logout, unmount e limpeza. Os 85 de aprovação preservam, entre outros, a trava compartilhada por pedido, reconciliação após resposta perdida e isolamento de sessão. Não se escreveu teste para repetir uma simples troca de texto.

A prova WebSocket real está na seção anterior e tem escopo menor que as fixtures. Nenhuma delas comprova a aprovação positiva real que ficou pendente. Não existe script lint no frontend; não foi inventado.

Logs/evidências temporárias, fora dos repositórios: `/tmp/qr-realtime-{frontend,approvals,backend,security,build,pint}.log`, `/tmp/qr-realtime-outage.log`, `/tmp/qr-realtime-last-cycle.log`, `/tmp/qr-realtime-final-state.json` e `/tmp/qr-realtime-*-events*.jsonl`. Capturas `/tmp/qr-realtime-*.png` foram inspecionadas; não são artefatos permanentes versionados. Bibliotecas de browser já disponíveis em `/tmp/qr-browser-libs` foram reutilizadas.

## Estado final e comandos de operação

API 8080 e frontend 5174 preexistentes foram preservados. **Reverb PID 432 e worker dedicado PID 284, dentro do container, continuam ativos**, iniciados por esta tarefa; 8081 atende WebSocket. Sessão 490 permanece `occupied/unpaid`, `closed_at=null`, zero payment records. #654 continua `confirmed`; #655–#658 continuam `waiting_approval`, `approved_at=null`, todos sem aceite/preparo/pronto/serviço/cancelamento/pagamento. A fila local dedicada está vazia; os 284 jobs antigos seguem em `default`.

As sessões de browser e os observadores exclusivos de teste são encerrados ao concluir a documentação; nenhum browser preexistente do usuário é encerrado. Não se interrompe API, Vite, PostgreSQL, Redis ou outro processo preexistente.

**O ambiente depende da linha local persistida `BROADCAST_QUEUE=realtime-local` e dos dois processos descritos.** Não são serviços supervisionados de produção; não se apresenta o realtime como operacional após fechar esses processos. Não rode uma segunda cópia em portas já ocupadas.

Se os containers existentes estiverem parados, a API já tem o servidor gerido pelo supervisor. Para iniciá-los, sem reconstruir/recriar infraestrutura:

```bash
docker start restaurants-api-pgsql-1 restaurants-api-laravel.test-1
```

Frontend, em terminal próprio, somente se 5174 não estiver em uso:

```bash
cd /home/dudu/projects/restaurants-web
npm run dev -- --host 127.0.0.1
```

Reverb e worker em dois terminais próprios, depois de inspecionar o conteúdo da fila dedicada:

```bash
cd /home/dudu/projects/restaurants-api
docker exec -it restaurants-api-laravel.test-1 php artisan reverb:start --host=0.0.0.0 --port=8081
```

```bash
docker exec -it restaurants-api-laravel.test-1 php artisan queue:work database --queue=realtime-local --sleep=1 --tries=0 --backoff=10 --timeout=60
```

Para a execução em background com PID/log, os comandos efetivamente usados são:

```bash
docker exec -d restaurants-api-laravel.test-1 sh -c 'echo $$ > /tmp/qr-realtime-reverb.pid; exec php artisan reverb:start --host=0.0.0.0 --port=8081 >> /tmp/qr-realtime-reverb.log 2>&1'
docker exec -d restaurants-api-laravel.test-1 sh -c 'echo $$ > /tmp/qr-realtime-worker.pid; exec php artisan queue:work database --queue=realtime-local --sleep=1 --tries=0 --backoff=10 --timeout=60 >> /tmp/qr-realtime-worker.log 2>&1'
```

Para encerrar **somente os processos de background desta tarefa**, validando seu comando para evitar PID reaproveitado:

```bash
docker exec restaurants-api-laravel.test-1 sh -c 'pid=$(cat /tmp/qr-realtime-reverb.pid); case "$(tr "\000" " " < /proc/$pid/cmdline)" in "php artisan reverb:start "*) kill -TERM "$pid";; *) echo "PID não corresponde ao Reverb esperado"; exit 1;; esac'
docker exec restaurants-api-laravel.test-1 sh -c 'pid=$(cat /tmp/qr-realtime-worker.pid); case "$(tr "\000" " " < /proc/$pid/cmdline)" in "php artisan queue:work database --queue=realtime-local "*) kill -TERM "$pid";; *) echo "PID não corresponde ao worker esperado"; exit 1;; esac'
```

Processos iniciados em terminais próprios podem ser encerrados com Ctrl+C nesses terminais. Esta tarefa não iniciou API/Vite; não use `docker stop`, `pkill`, `queue:restart` global ou encerramento por porta para parar os processos desta tarefa.

Para restaurar a escolha anterior de fila, pare o worker dedicado e remova **apenas** a linha `BROADCAST_QUEUE=realtime-local` e seu comentário do `.env`. Não substitua o arquivo inteiro se ele recebeu mudanças posteriores. O backup protegido está em `/tmp/qr-realtime-baseline/api-env`; o código com opção ausente conserva a fila padrão. Jobs eventualmente ainda presentes em `realtime-local` conservam esse nome e precisam ser tratados nessa própria fila. A restauração não autoriza processar o backlog `default`: inspecione-o novamente antes de escolher qualquer worker.

Comando exato da suíte backend, sem escapes de tabela Markdown:

```bash
docker exec -e DB_DATABASE=testing -e DB_URL= restaurants-api-laravel.test-1 php artisan test --filter='Realtime|OrderApprovalTest|KitchenQueueTest'
```

## Passo manual para encerrar a validação positiva

1. Abrir waiter local no restaurante 1 em `http://localhost:5174/app/service?restaurant=1&table=11` e a cozinha autorizada em outra sessão/contexto.
2. Confirmar indicador conectado nas duas telas. No drawer, abrir **#658**, revisar 1× Hamburguesa AFORO TEST, 13,50 € e a nota do item “PRUEBA LOCAL REALTIME — no preparar. Validación final sin lectura duplicada.”
3. Clicar/tocar normalmente em **Aprobar**, uma vez. Confirmar exatamente um `POST /api/v1/orders/658/approve → 200`.
4. Sem refresh, confirmar remoção de #658 da fila, permanência no histórico como `confirmed`, recebimento de `order.status_changed` na cozinha e aparecimento em Nuevos, junto de #654. Não tocar em Aceptar pedido.
5. Não regredir #654 nem #658, e não aceitar/preparar/servir/pagar/encerrar nesta etapa. Os demais pedidos de teste permanecem pendentes para decisão explícita posterior.

## Git — workspace completo, incluindo trabalho anterior

Branches preservadas: API `fix/security-hardening`, frontend `main`. A captura inicial está em `/tmp/qr-realtime-baseline`. Hashes dos arquivos preexistentes foram comparados: fora dos arquivos de código/teste listados nesta tarefa, os arquivos versionados e untracked preexistentes mantiveram seus bytes. A alteração local de `.env` foi verificada separadamente. O relatório e os três testes realtime são novos.

As saídas abaixo representam o workspace inteiro. **Não atribuir o diff completo a esta tarefa.** Há trabalho anterior de QR, segurança, staging e catálogo; untracked não entram em `git diff --stat`.

### restaurants-api

`git status --short`

```text
 M app/Actions/Orders/CreatePublicOrderAction.php
 M app/Actions/Orders/OrderCreationService.php
 M app/Actions/Public/ResolvePublicTableAction.php
 M app/Actions/TableRequests/CreatePublicTableRequestAction.php
 M app/Actions/Tables/OpenTableAction.php
 M app/Events/Realtime/RealtimeEvent.php
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
 M config/broadcasting.php
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
 M tests/Feature/Realtime/EventPayloadContractTest.php
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
 app/Events/Realtime/RealtimeEvent.php              |  5 +++
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
 config/broadcasting.php                            |  4 ++
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
 .../Feature/Realtime/EventPayloadContractTest.php  | 16 +++++++
 .../RestaurantSettings/FeatureTogglesTest.php      | 18 ++++----
 tests/Feature/Security/PublicAbuseTest.php         | 16 ++++---
 tests/Feature/Security/SecurityCloseoutTest.php    |  6 ++-
 .../TableRequest/TableRequestLifecycleTest.php     |  4 +-
 .../Feature/TableSession/PaidSessionBlocksTest.php | 24 ++++++-----
 38 files changed, 300 insertions(+), 163 deletions(-)
```


### restaurants-web

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
 M src/composables/useRestaurantOperations.ts
 M src/composables/useRestaurantRealtime.ts
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
 M src/views/DashboardView.vue
 M src/views/LoginView.vue
 M src/views/kitchen/KitchenView.vue
 M src/views/public/PublicTableView.vue
 M src/views/service/ServiceView.vue
 M tests/frontend-hardening-build.mjs
 M tests/frontend-hardening.mjs
 M tests/frontend-security.browser.ts
 M vite.config.ts
?? .claude/skills/ui-ux-pro-max/scripts/__pycache__/
?? docs/QR-auto-open-report.md
?? docs/QR-popup-approval-validation-report.md
?? docs/QR-realtime-validation-report.md
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
?? tests/frontend-realtime.browser.ts
?? tests/frontend-realtime.html
?? tests/frontend-realtime.mjs
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
 src/components/dashboard/table/TableOrdersList.vue |   62 +-
 src/components/public/PublicPostVisitView.vue      |    4 +
 src/components/public/PublicProductFeed.vue        |   17 +-
 src/components/service/OrderDetailSheet.vue        |   18 +-
 src/composables/useOrderApprovals.ts               |  122 +-
 src/composables/usePublicEntryState.ts             |    7 +
 src/composables/usePublicMenu.ts                   |    5 +-
 src/composables/usePublicTableResolution.ts        |   44 +-
 src/composables/useRestaurantOperations.ts         |    9 +-
 src/composables/useRestaurantRealtime.ts           |  349 +-
 src/config/env.ts                                  |   82 +-
 src/config/runtime.ts                              |    4 +-
 src/i18n/locales/ca-ES-valencia.ts                 | 3224 ++++-----
 src/i18n/locales/en-GB.ts                          | 3224 ++++-----
 src/i18n/locales/es-ES.ts                          | 3238 ++++-----
 src/main.ts                                        |   64 +-
 src/realtime/echo.ts                               |  167 +-
 src/services/product.service.ts                    |  148 +-
 src/services/public-table.service.ts               |   19 +-
 src/utils/error-message.ts                         |    1 +
 src/utils/table-public-url.ts                      |   70 +-
 src/views/DashboardView.vue                        |    8 +-
 src/views/LoginView.vue                            |  500 +-
 src/views/kitchen/KitchenView.vue                  |    9 +-
 src/views/public/PublicTableView.vue               |  335 +-
 src/views/service/ServiceView.vue                  |   86 +-
 tests/frontend-hardening-build.mjs                 |  154 +-
 tests/frontend-hardening.mjs                       |  270 +-
 tests/frontend-security.browser.ts                 |    2 +-
 vite.config.ts                                     |   56 +-
 42 files changed, 10520 insertions(+), 10034 deletions(-)
```

