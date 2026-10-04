# PR-SEC1B — FRONTEND ADVERSARIAL SECURITY REPORT

Data: 2026-10-04. Repositório: `restaurants-web`. Execução somente local.

HEAD: `5157feb` — `feat: harden frontend for staging readiness`.
Initial clean: **YES** (`git status --short` vazio). Branch: `main`, alinhada com `origin/main`. Precheck incluiu `git branch -vv` e os últimos 15 commits. HEAD não foi alterado.

## Método e limites da evidência

Auditoria estática do source, fixtures locais nos módulos reais via Vite, Chromium headless com componentes reais, builds development/production e npm audit. Nenhuma fixture alterou banco, conta, pedido, pagamento ou configuração reais. Os POSTs dos testes foram substituídos por doubles locais.

Os checks de router usam o guard real com componentes placeholder e contextos de permissões representativos de waiter/cashier/kitchen. Os checks de DOM usam componentes reais. **Não houve login nas três contas reais nem validação das Policies, cookies, CORS ou headers do ambiente de staging.** O veredicto abaixo libera a próxima validação de segurança em staging; não certifica produção nem o backend.

## XSS SINKS

Nenhum `v-html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `eval` ou `new Function` no source de execução da aplicação. Timers recebem funções, nunca strings. QR usa módulos numéricos para construir o atributo SVG `d`; não injeta HTML nem usa serviço externo.

Exceção identificada: `src/views/aforo-dashboard.html`, protótipo com `innerHTML`, `outerHTML` e leitura de HTML persistido em `aforo-floor-layout`. É inseguro como aplicação independente, mas não é importado pelo entrypoint nem está no dist. Deve continuar fora de qualquer publicação; não servir o diretório source em staging. Regression scan rejeita seu marcador no bundle.

## URL SCHEMES

Links de Google review e URLs remotas de mídia agora passam por `safeHttpUrl`: apenas URLs absolutas HTTP/HTTPS, sem credenciais, backslash, whitespace ou controles. Testes rejeitam `javascript:`, `data:`, `vbscript:`, `//`, URLs incompletas e esquemas com newline. Links inválidos não recebem `href`; mídia inválida usa o fallback existente. HTTP local continua suportado. O backend mantém a allowlist de hosts de Google; o frontend não a duplica.

URLs públicas são construídas a partir da origem validada e do token com `encodeURIComponent`. PDFs usam resposta autenticada Blob e download local; não navegam para uma URL arbitrária devolvida pelo servidor. Links externos existentes têm `noopener noreferrer`. A origem de mídia HTTP em staging/produção ainda precisa ser corrigida pelo backend para HTTPS; o navegador pode bloquear mixed content.

## STORED XSS

Fixtures: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `"><svg onload=alert(1)>`, Unicode/emoji/RTL/quotes/newline e texto de 10k caracteres.

Chromium confirmou texto literal e nenhum handler executado em produto, categoria pública, staff, restaurant switcher, feedback detail e **DayCloseDetailView com annotation devolvida pelo service double**. Também foi testado o textarea real de annotation. Nenhum nó com `onerror`/`onload` foi injetado; contador de alerts permaneceu zero. Vue interpolation permanece escaped.

## AUTH STORAGE

Nenhum admin bearer token, segredo de sessão, Meta, DB ou Supabase no storage escrito pela aplicação. Auth vive em memória e usa cookies Sanctum pelo Axios; nenhum código copia cookies XSRF/session para storage.

Persistência existente:

| Storage | Conteúdo | Capacidade/risco |
| --- | --- | --- |
| localStorage | Tema, locale, ID do restaurant selecionado | Preferências; ID revalidado contra lista/contexto, não concede autorização |
| localStorage por public token | Carrinho público | Dados de conveniência adulteráveis; backend recalcula e valida pedido |
| localStorage por public token | Feedback token e flag submitted | Capacidade pública real de feedback, acessível a scripts da mesma origem; validade/eligibilidade/submissão são autoridade do backend |
| sessionStorage por public token | Flags de intro/welcome | UX por sessão; não concede privilégio admin |

Feedback token não tem expiração client-side automática; tokens inválidos são removidos ao receber a resposta correspondente. TTL/rotação no servidor e dispositivos compartilhados devem ser verificados em staging. Não se deve tratar a flag local submitted como prova de autorização.

## ROUTE GUARDS

Fixtures de permissões waiter/cashier/kitchen tentaram navegação direta a settings, staff, menu, feedback e detalhe de day close: denied no guard antes de montar a rota. Waiter/cashier com `close_daily_operation` podem acessar today; kitchen sem essa capacidade não acessa. Histórico e WhatsApp usam capacidades próprias; `tab=history` não concede `view_daily_closes`.

Adicionada rechecagem de identidade após awaits do restaurant store. `App.vue` só monta uma rota `requiresAuth` enquanto authenticated. Chromium confirmou ausência de conteúdo protegido antes da autenticação e remoção do conteúdo/modal aberta após expiração. Essa evidência testa o gate global real; não equivale a testar todas as telas com todas as contas reais. Backend continua autoridade.

## TENANT STALE STATE

Corrigidos: lista de restaurants que podia voltar depois de clear/logout; settings antigos de A que podiam substituir A novo após A → B → A; análise/staff/pending approvals/day-close preview/history que retinham dados anteriores durante loading; resultado de submit diário após mudança de escopo.

Fixtures com respostas fora de ordem verificaram A → B → A no store e em cinco composables montados: analytics, staff, approvals, history e preview. Respostas de A antigo e B atrasado foram descartadas e os dados finais vieram do terceiro request de A. Fixtures também confirmaram lista vazia depois de logout com resposta antiga pendente. Limpeza de análise, staff, approvals e cierre ocorre com watchers síncronos antes da renderização do novo contexto.

## SESSION / AUTH EDGE CASES

Checks reais de módulos cobrem 401/419, network, 500, falha de logout, bootstrap/retry e expiração repetida. Logout limpa a sessão local imediatamente, inclusive enquanto o request de logout está pendente; failure mantém notice `logoutIncomplete`.

Auth usa geração de sessão para impedir que `/me`, context ou login antigo reponham identidade/permissões. O interceptor autenticado identifica requests pela geração, descarta successes/errors da geração anterior e bloqueia novos requests protegidos depois de invalidar a sessão. Fluxos explícitos de auth permanecem possíveis. 401/419 em login/CSRF/logout não produzem loop de expiração. Network/500 falham a operação sem inventar logout nem retry automático.

Chromium testou expiração com modal aberta. Request protegido pendente que resolvesse depois da invalidação e uma ação protegida posterior foram rejeitados nos doubles Axios. Cancelar no frontend não desfaz uma mutação que o backend já aceitou; idempotência e revalidação continuam obrigatórias no servidor.

## CSRF CLIENT

Verificação adicional de auth: refreshes concorrentes de context usam sequência própria; fixture confirma que uma resposta antiga não substitui permissões mais recentes na mesma sessão.

`http`: `withCredentials: true`, `withXSRFToken: true`, timeout de 30s. Login solicita `/sanctum/csrf-cookie` antes do POST. `publicHttp` é uma instância separada sem credentials/XSRF habilitados. Ausência de armazenamento de tokens de cookie em localStorage confirmada por inspeção. Cookies HttpOnly/Secure/SameSite e CORS devem ser inspecionados no backend/staging; não podem ser certificados pelo source frontend.

## OPEN REDIRECT

Não há consumo de `next`, `redirect` ou return URL para navegação externa. Redirects do router são paths/names internos. `next=https://evil.example&redirect=//evil.example` foi testado no router real e não produziu navegação externa. Table/restaurant query params têm finalidade operacional, não representam URLs de retorno.

## QR / TOKEN EXPOSURE

Public token aparece na rota/QR, endpoints públicos e chaves de storage por mesa; feedback token aparece nos endpoints/capacidade pública correspondente. QR é gerado localmente. Não foram encontrados logs de tokens, analytics externos ou envio intencional dos tokens a terceiros.

Adicionada política global `Referrer-Policy` via meta `no-referrer`, que também cobre imagens, posters e vídeo carregados de outra origem. Imagens remotas têm atributo defensivo `referrerpolicy`. Isso evita transmitir a rota com token em Referer, inclusive a hosts externos same-site. O token ainda existe na URL e no histórico; backend/proxy devem redigir access logs e aplicar validade adequada.

## THIRD-PARTY REQUESTS

Inventário de execução: assets de mesma origem; API definida em `VITE_API_URL`; Reverb definido por host/porta; imagens/vídeos indicados pelo backend; navegação voluntária para Google review. Font stack usa fontes de sistema, sem fetch Google Fonts. Não há chamada frontend direta para Meta/Supabase, analytics ou CDN de QR.

Protótipo inclui Google Fonts e Unsplash, mas está fora do bundle. Pusher contém strings/fallbacks de vendor para CDN/SockJS/stats: transports são limitados a ws/wss e stats foi explicitamente desativado (`enableStats: false`). Não adicionar esses hosts à futura CSP apenas por aparecerem no código vendor. Domínios efetivos de armazenamento de mídia ainda precisam ser inventariados em staging.

## CSP REQUIREMENTS / CLICKJACKING

Inventário para o servidor futuro; **nenhuma configuração Nginx ou header CSP foi implementada**:

| Diretiva | Requisito |
| --- | --- |
| default-src | `'none'` como base, com exceções abaixo |
| script-src | `'self'` e hash/nonce para script de tema; sem `unsafe-eval` |
| connect-src | API HTTPS configurada e Reverb WSS configurado; `'self'` se necessário; sem wildcard de terceiros |
| img-src | `'self'`, `blob:` para preview local e origens HTTPS de mídia aprovadas |
| media-src | `blob:` para preview e origens HTTPS de vídeos aprovadas; `'self'` quando houver mídia local |
| style-src-elem | `'self'` para CSS de build |
| style-src-attr | `'unsafe-inline'` atualmente necessário para estilos dinâmicos de gráficos/mapa/progressos/transitions; avaliar refactor separado |
| font-src | `'self'` é suficiente; fontes de sistema não geram rede |
| frame-ancestors | `'none'`: nenhum contrato de embedding identificado |
| base-uri / object-src | `'none'` |
| form-action | `'self'`; login é Axios, não navegação de formulário externa |

Script inline de tema no **dist de produção auditado**: `sha256-Sc4ToTCRuwfZJwF9El9yQ42YZVtRxI2kQAFOKNeKFM4=`. Calcular novamente sobre os bytes efetivos a cada build; não copiar um hash de source não minificado. CSP pode separar styles de elemento/atributo conforme suporte dos navegadores alvo; fallback `style-src` precisa considerar os atributos inline existentes.

Zero `eval`/`new Function` no bundle; Vue templates estão pré-compilados. O script de tema não obriga `unsafe-inline` em script-src se usar hash/nonce. CSP e frame-ancestors precisam ser headers HTTP futuros; meta não implementa proteção contra clickjacking. Testar inicialmente Report-Only para mapear origens reais, antes de enforce. Recomendar também header `Referrer-Policy: no-referrer` e `X-Content-Type-Options: nosniff` no servidor.

## ERROR DISCLOSURE

Corrigido Dashboard que exibia diretamente `restaurantStore.error.message`, inclusive em erros de servidor. Agora usa tradução apropriada ao kind. Normalização filtra mensagens/field errors com SQLSTATE/SQL, stack traces, paths locais, Bearer/JWT e atribuições de token/secret/password/key, além de texto >1000 caracteres. Fixtures 422 controladas confirmam supressão, e uma mensagem 409 de negócio permanece disponível. WhatsApp não apresenta raw failure reason/provider body; usa códigos traduzidos. IDs técnicos de feedback não são apresentados no detail.

Filtro é defesa adicional, **não garantia universal contra qualquer segredo em texto arbitrário**. 409/422 de negócio continuam com fallback de mensagem do backend, conforme contrato existente. Backend deve emitir mensagens públicas e nunca devolver stack, SQL, raw provider responses ou segredos; validar esse contrato com erros reais de staging.

## UPLOAD CLIENT / CONTENT SECURITY

`accept` e checks de MIME/size são UX, conforme comentário explícito em `product-media.ts`; backend valida conteúdo real. Upload permite JPEG/PNG/WebP e MP4/WebM, sem SVG/HTML. Não há FileReader/DOMParser ou execução do conteúdo como HTML. Mídia remota é atributo src/poster após verificação de esquema, nunca HTML.

`ProductMediaSlot` revoga object URLs na troca de arquivo e no unmount. Download revoga em finally via callback timer. Serviço PDF verifica content type antes do download. Scans estáticos verificaram essas rotas; não houve upload real de conteúdo malicioso nem inspeção do processamento de arquivos no backend.

## DEPENDENCIES

`npm ci` e `npm audit --json`: **zero vulnerabilidades conhecidas** (critical/high/moderate/low/info = 0 na consulta). Agent-browser permanece devDependency; não entrou no dist.

Vue, Router, Pinia, Axios, i18n, Echo/Pusher, Phosphor e qrcode têm consumidores identificados. `@tailwindcss/vite`/`tailwindcss` são ferramentas de build hoje listadas em dependencies; movimentá-las a devDependencies é melhoria de classificação, sem finding de vulnerabilidade e sem mudança de lockfile nesta auditoria. A classificação npm não significa que o Node server seja necessário para servir o dist estático.

## SOURCE MAP / BUILD LEAK / SECRET SCAN / DEV ARTIFACTS

Build final de production com valores fictícios do formato documentado em `.env.example`: `https://api.production.example`, `https://app.production.example`, `ws.production.example:443`, HTTPS/WSS e `public-example-key`. Variáveis foram passadas somente ao processo; nenhum arquivo .env real foi editado.

91 arquivos no dist final; **0 .map**, 0 application localhost origins, 0 harness/agent-browser/prototype markers, 0 private-secret markers ou Bearer JWT. Presença dos três endpoints `.example` esperados foi confirmada. O fallback vendor inerte `http://localhost` é distinguido de endpoints AFORO, conforme test de hardening existente.

Scan de source/dist por APP_KEY, DB_PASSWORD, SUPABASE, SERVICE_ROLE, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN, REVERB_APP_SECRET, PRIVATE_KEY e Bearer ey não encontrou valores privados. Substring APP_KEY em `VITE_REVERB_APP_KEY` corresponde à **chave pública** de websocket, não secret. .env local contém apenas os seis nomes VITE já documentados. Dois emails `.test` em comentário de type kitchen são notas antigas de QA, sem senha e sem emissão no dist; nenhum email/senha real hardcoded foi encontrado no source de execução. `tests/`, fixtures e prototype não são entrypoints do build.

## INPUT ABUSE

Os cinco payloads foram renderizados nas superfícies listadas acima. Nome de staff com 10k caracteres revelou overflow horizontal de 79.864px em host de 360px. Corrigido com `overflow-wrap: anywhere` na base herdada, seguindo o skill local ui-ux-pro-max. Reteste: overflow staff = 0 e produto = 0, sem execução de HTML e sem destruir controles. Textarea preserva Unicode/quotes/newlines. Não é uma medição exaustiva de todos os breakpoints/temas e campos; backend continua responsável pelos limites reais.

## DUPLICATE SUBMISSIONS

Adicionados guards síncronos de single-flight no submit de day close, confirmação de pagamento, criação manual de pedido, ação de table drawer, approvals, staff e login. Pagamento revalida `canRecordPayments` no handler; clear do bill impede usar saldo da sessão anterior durante loading. Day close revalida capacidade/contexto e descarta resultados de escopo antigo.

Double-click real no botão de confirmação de pagamento em Chromium executou um único service POST double. Duas chamadas simultâneas a day-close submit executaram uma única create. Settings já usa pending por restaurant/domínio e WhatsApp resend já usa pending por restaurant/close e idempotency key; checks de browser existentes exercitam esses casos. Guards client-side não substituem idempotência/transação backend nem impedem requests manuais externos.

## FINDINGS

| ID | Severidade inicial | Achado | Situação |
| --- | --- | --- | --- |
| SEC-01 | High | Respostas pendentes de identidade/context/list podiam repor estado depois de logout/expire | Corrigido e testado |
| SEC-02 | High | Estado de tenant anterior retido em superfícies sensíveis durante troca e settings A antigo após A-B-A | Corrigido nas superfícies identificadas; testes fora de ordem |
| SEC-03 | Medium | URL de backend aplicada diretamente em href/src, sem bloqueio de esquema | Corrigido; allowlist de hosts permanece backend |
| SEC-04 | Medium | Erro bruto de servidor no Dashboard e diagnósticos em mensagens de validação | Corrigido para caminhos/payloads identificados; contrato backend ainda deve ser validado |
| SEC-05 | Medium | Handlers de mutações permitiam chamadas concorrentes antes do DOM desabilitar botão | Guards adicionados; pagamento/day-close testados |
| SEC-06 | Medium | Referrer de rota pública podia acompanhar mídia externa, sobretudo same-site | Meta global no-referrer e atributos de imagem adicionados |
| SEC-07 | Low | Nome longo quebrava layout de staff | Corrigido e retestado no Chromium |
| SEC-08 | Informational | Protótipo com stored HTML inseguro, fora do dist | Inventariado; regression scan de bundle |
| SEC-09 | Informational | Headers CSP/clickjacking ainda dependem do hosting; ferramentas Tailwind classificadas como prod | Requisitos/documentação, sem Nginx/deploy |

Critical: nenhum identificado. High: SEC-01/02 corrigidos; nenhum conhecido remanescente no escopo exercitado. Medium/Low: correções acima; permanecem requisitos de HTTPS/allowlist de mídia, mensagens públicas backend e validação real de cookies/headers. Informational: capacidade pública persistida acessível à mesma origem, protótipo e classificação de dependências.

## FIXES APPLIED / TESTS ADDED

Mudanças descritas por superfície acima. Novo `npm run test:security` usa Vite/Axios/Pinia já instalados, sem framework novo. `tests/frontend-security.browser.ts` monta componentes e composables reais com fixtures. `frontend-hardening-build.mjs` agora rejeita .map, eval sinks, secret markers e novos harness/prototype markers no dist.

Reprodução do browser: iniciar Vite local e, no console da página local, executar `import('/tests/frontend-security.browser.ts').then(m => m.runSecurityBrowserChecks())`. Não disponibilizar testes pela origem publicada. O runner de WhatsApp existente é `import('/tests/day-close-whatsapp.browser.ts').then(m => m.runWhatsAppChecks())`.

## QUALITY

| Check | Resultado |
| --- | --- |
| npm ci | PASS; 135 packages instalados, 0 vulnerabilities |
| npx vue-tsc -b | PASS; também executado nos builds |
| npm run test:hardening | PASS: 115 checks; 14 builds inválidos recusados e 2 builds seguros HTTPS/WSS |
| npm run test:security | PASS: 54 checks adversariais |
| Chromium security harness | PASS: 125 checks, alerts = 0; overflow staff/product = 0 |
| Chromium WhatsApp harness existente | PASS: 25 checks de race, double-confirm, idempotency, mensagens e polling |
| npm run build | PASS |
| npm run build:production | PASS com exemplos seguros; dist final auditado |
| npm audit --json | PASS: 0 vulnerabilities |
| git diff --check | PASS |

## FILES CHANGED

`index.html`, `package.json`, `src/App.vue`, `src/api/errors.ts`, `src/api/session.ts`, `src/main.ts`, `src/realtime/echo.ts`, `src/router/index.ts`, `src/stores/auth.ts`, `src/stores/restaurant.ts`, `src/style.css`, `src/utils/safe-url.ts`, `src/views/DashboardView.vue`, `src/views/day-close/DayCloseView.vue`, `src/views/settings/SettingsView.vue`, `src/components/dashboard/table/TableBillPanel.vue`, `src/components/dashboard/table/TableDetailsDrawer.vue`, `src/components/menu/ProductMediaSlot.vue`, `src/components/public/PublicGoogleReviewCta.vue`, `src/components/public/PublicProductReelCard.vue`, `src/components/service/ServiceOrderComposer.vue`, `src/composables/useDayCloseHistory.ts`, `src/composables/useDayClosePreview.ts`, `src/composables/useDayCloseSubmit.ts`, `src/composables/useOrderApprovals.ts`, `src/composables/useOrganizationStaff.ts`, `src/composables/useRestaurantAnalytics.ts`, `tests/frontend-hardening-build.mjs`, `tests/frontend-security.mjs`, `tests/frontend-security.browser.ts` e este relatório. `dist` foi regenerado e continua ignorado; lockfile e .env não mudaram.

## SECURITY VERDICT

**A) NO CRITICAL/HIGH FINDINGS REMAIN — READY FOR STAGING SECURITY VALIDATION**, no escopo local auditado e com as correções desta working tree aplicadas.

Staging ainda deve verificar contas reais e Policies, cookies/CORS/CSRF, origens de mídia, headers, logs redigidos e comportamento backend de idempotência/erros/uploads. Esse é o próximo gate, não um resultado já obtido.

COMMIT: **NO**. PUSH: **NO**. DEPLOY: **NO**.
