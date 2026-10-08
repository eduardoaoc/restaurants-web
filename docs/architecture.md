# AFORO restaurants-web — Architecture

> Documento complementar a `CLAUDE.md` (regras permanentes do projeto) e
> `docs/design-system.md` (sistema visual). Este documento descreve **como o
> código está organizado hoje**, com base na leitura direta do código-fonte
> (não em suposições). Se algo aqui ficar desatualizado, confie no código,
> não neste arquivo.

## 1. Stack

- **Vue 3** (Composition API, `<script setup>`) + **TypeScript** + **Vite**.
- **Vue Router** para navegação, com guarda de autenticação/permissões em
  `src/router/index.ts`.
- **Pinia** para estado global (auth, restaurante atual, tema).
- **Vue I18n** para `es-ES` / `ca-ES-valencia` / `en-GB`.
- **Tailwind CSS v4** via plugin Vite (tokens em `src/styles/tokens.css`,
  mapeados em `src/style.css`).
- **Axios** como único cliente HTTP (`src/api/http.ts`), sessão via
  **Laravel Sanctum** (cookie SPA, nunca token).
- **Laravel Echo + Pusher-js** sobre **Laravel Reverb** para realtime
  (`src/realtime/echo.ts`).
- Build: `npm run build` = `vue-tsc -b && vite build`. Não há script `lint`
  no `package.json` hoje.

## 2. Estrutura de pastas (`src/`)

```
src/
  api/          camada HTTP crua: client axios, interceptors, normalização de erro
  services/     uma função por endpoint/recurso, usa api/http.ts
  stores/       Pinia — só estado global/cross-cutting (auth, restaurant, theme)
  composables/  um "use*" por fluxo de tela — chama services, expõe estado reativo
  views/        uma página por rota (usada em router/index.ts)
  components/   componentes de UI, organizados por domínio (ver §7)
  layouts/       AppShellLayout.vue — casca da área autenticada (/app/*)
  router/        rotas + guarda de auth/permissão
  types/         um arquivo por recurso de domínio, 1:1 com o contrato do backend
  i18n/          vue-i18n: locales, persistência, formatação
  realtime/      cliente único do Laravel Echo (Reverb)
  config/        leitura/validação de variáveis de ambiente (env.ts, runtime.ts)
  utils/         funções puras (formatação, regras de apresentação, etc.)
  styles/        tokens.css — fonte única de cor/tipografia/forma
  assets/        imagens, marca (brand/), referências visuais (images/ref/)
```

Regra de dependência (de fora para dentro): `views → components/composables
→ services → api`. `stores` é lido por `composables`/`views`/`router`, nunca
o contrário. `types` não importa nada do app — é só contrato de dados.

## 3. Camada HTTP (`src/api/`)

- **`http.ts`** — instância única do axios para a área autenticada.
  `withCredentials: true` + `withXSRFToken: true` (API e SPA estão em
  origens diferentes em dev, então o XSRF-TOKEN precisa ser lido/enviado
  explicitamente para o CSRF check do Sanctum). `baseURL` vem de
  `appConfig.apiUrl` (`src/config/runtime.ts`).
- **`public-http.ts`** — cliente separado para o fluxo público de QR
  (`/public/...`), que nunca deve depender da sessão admin.
- **`session.ts`** (`installSessionInterceptor`) — intercepta toda
  requisição/resposta do cliente autenticado para:
  - cancelar chamadas feitas depois que a sessão expirou (exceto o próprio
    fluxo de auth: login/csrf-cookie/logout/me);
  - descartar respostas "stale" (de uma geração de sessão anterior —
    protege contra race condition ao trocar de usuário/restaurante);
  - disparar `expire()` (expira a sessão local) em 401/419 fora do fluxo de
    login.
- **`errors.ts`** (`normalizeApiError`) — único ponto que traduz uma
  resposta Axios/Laravel em um `ApiError` tipado
  (`validation | invalid_credentials | unauthenticated | forbidden |
  not_found | conflict | rate_limited | server | network | unknown`).
  Entende dois formatos de erro do backend: o `{message, errors}` padrão do
  Laravel e o `{error:{code,message}}` usado pelas regras de domínio
  (ex.: `TABLE_SESSION_HAS_NO_BILLABLE_ORDERS`). Também sanitiza mensagens
  (remove SQL/stack trace/tokens) antes de deixá-las chegar à UI.
- **`retry-after.ts`** / **`timeouts.ts`** — parsing do header `Retry-After`
  (429) e timeout padrão das requisições.

Toda tela deve consumir erros via `normalizeApiError`/`ApiError.kind`, nunca
checar `status` cru na UI (CLAUDE.md §13).

## 4. Autenticação e sessão (`src/stores/auth.ts`)

- Sessão = cookie Sanctum. `bootstrap()` chama `GET /auth/me` **uma única
  vez por carregamento de página**, mesmo que vários componentes/guards o
  chamem ao mesmo tempo (promise memoizada).
- `login()` sempre busca `GET /sanctum/csrf-cookie` antes de
  `POST /auth/login` (fluxo padrão do Sanctum SPA).
- Após identidade confirmada (`me`/`login`), a store busca
  `GET /auth/context` (`fetchAuthContext`) — isso popula `authContext`, a
  base de **todo** o sistema de permissões do frontend (§6). Falha nessa
  chamada nunca derruba uma sessão válida: `authContext` fica `null` e todo
  `can()`/`canOrganization()`/`canPlatform()` passa a responder `false`
  (fail-closed), mas o usuário continua logado.
- `sessionGeneration` é incrementado a cada logout/expiração — usado por
  `session.ts` e por composables (ex. `useOrderApprovals`) para descartar
  respostas que chegaram depois que a sessão/contexto mudou.
- `logout()` limpa estado local, desconecta o Echo (`disconnectEcho()`) e
  só então chama `POST /auth/logout`.

## 5. Contexto multi-restaurante (`src/stores/restaurant.ts`)

Implementa literalmente a regra de `CLAUDE.md` §10 — nunca existe
`user.restaurant` singular:

- `restaurants` vem de `GET /api/v1/restaurants` (o backend decide o
  escopo).
- `availableRestaurants` filtra ainda mais por `isRestaurantEligible()`,
  cruzando com `authContext.organizations[].restaurants[]` (organização e
  restaurante precisam estar `status === 'active'`).
- `currentRestaurantId` é a única parte persistida (`localStorage`,
  `aforo-restaurant-id`) — sempre revalidada contra a lista fresca antes de
  ser reutilizada; um id obsoleto/de outra conta é descartado.
- `applyRestaurantUpdate` / `applySettingsUpdate` aplicam a resposta
  autoritativa do backend após um PATCH, com proteção contra resposta
  tardia de uma troca de restaurante no meio do caminho (keyed por id,
  nunca "o restaurante atual").
- `loadCurrentSettings()` só busca `GET /restaurants/{id}/settings` se o
  usuário tiver `manage_restaurants` **nesse restaurante** — um 403 aqui é
  esperado, não um erro a reportar.

## 6. Autorização / permissões (`src/types/auth-context.ts`,
   `src/composables/usePermissions.ts`)

- `GET /auth/context` retorna `{ user, platform, organizations[] }`, onde
  cada organização tem permissões **próprias** (bucket organization-wide,
  `restaurant_id = null`) e cada restaurante dentro dela tem a **união**
  desse bucket + o que foi concedido especificamente ali.
- Três escopos de permissão, nunca misturados:
  - **Tenant/restaurante** (`PermissionSlug`) — `can()`/`canAny()` leem o
    restaurante **atual** (`restaurantStore.currentRestaurantId`).
  - **Organização** (`canOrganization()`) — bucket org-wide, para ações
    nunca restaurante-escopadas (`manage_organization`, `manage_users`).
  - **Plataforma** (`canPlatform()`, `PlatformPermissionSlug`) — namespace
    totalmente separado (prefixo `platform_`), nunca confundido com os
    dois anteriores.
- `canOnRestaurant(id, permission)` existe para decidir algo sobre um
  restaurante que ainda não é o "atual" (ex.: destino de um QR escaneado
  antes de o usuário trocar de restaurante).
- Toda função é **fail-closed**: contexto ainda carregando, ausente, ou
  última busca falhou → toda checagem retorna `false`. Nunca "assume sim".
- **Regra de ouro (CLAUDE.md §9):** nunca checar `role === 'owner'` — toda
  decisão de UX lê um `permission` slug. O backend (Policies) continua
  sendo a única autoridade real; isso só evita oferecer uma ação que o
  backend recusaria.
- `can_manage_table_structure` é um booleano **derivado pelo backend**
  (combina `manage_floor_plan` OU `manage_tables` + a settings flag
  `waiter_table_management_enabled`) — o frontend só lê, nunca reimplementa
  essa regra.

## 7. Rotas e guarda (`src/router/index.ts`)

- `/t/:publicToken` (`meta.public`) — a única rota pública. A guarda
  `router.beforeEach` retorna **imediatamente** para ela, antes de tocar em
  `auth`/`restaurantStore` — o diner anônimo nunca depende do stack de
  sessão admin.
- `/app/*` (`AppShellLayout.vue`, `meta.requiresAuth`) — cada rota filha
  pode declarar `meta.permission` (uma slug ou uma lista = OR). A guarda:
  1. aguarda `auth.bootstrap()` (memoizado);
  2. redireciona para `login` se autenticação é exigida e falta, ou para o
     dashboard se é tela "guest only" e já autenticado;
  3. para contas puramente operacionais (sem `view_operations`/
     `view_reports`), redireciona a raiz `/app` para a tela de trabalho real
     (`kitchen` ou `service`) em vez de um dashboard vazio;
  4. aplica o(s) `meta.permission` da rota contra o restaurante atual.
- Telas como `service` e `settings` **não** usam `meta.permission` porque
  misturam capacidades independentes (ex.: `service` mistura
  `view_operations`, `approve_customer_orders`, `create_orders`) — cada
  seção se autogate internamente em vez de bloquear a tela inteira.
- `SERVICE_ACCESS_PERMISSIONS` (`types/auth-context.ts`) é a **única** lista
  usada tanto pela guarda de `/app/service` quanto por
  `useStaffTableEntry` (destino de um scan de QR) — nunca duas listas
  divergentes.

## 8. State management

- **Pinia** só para estado realmente global: `auth`, `restaurant`, `theme`
  (CLAUDE.md §11). Não há cache de respostas de API em Pinia.
- **Composables** (`src/composables/useXxx.ts`) são o padrão para estado de
  tela: buscam dados via `services/`, expõem `ref`/`reactive`, cuidam de
  `AbortController`, "generation" counters (para descartar respostas
  obsoletas após trocar de restaurante/sessão) e cleanup em
  `onBeforeUnmount`. Ver `useOrderApprovals.ts` como exemplo canônico desse
  padrão (fetch memoizado por restaurante + ações por item com estado
  próprio de loading/erro).

## 9. Camada de serviços (`src/services/`)

Um arquivo por recurso (`orders.service.ts`, `tables.service.ts`,
`staff.service.ts`, ...), cada função mapeando 1:1 para um endpoint real do
backend (comentários nos `types/*.ts` correspondentes documentam o
contrato OpenAPI verificado). Componentes **nunca** chamam `http`/`axios`
diretamente — sempre passam por `services/` (CLAUDE.md §11).

## 10. Realtime (`src/realtime/echo.ts`)

- Um único cliente Laravel Echo (Reverb) por sessão de app, nunca criado
  por componente (`getEcho()` memoiza; `disconnectEcho()` é chamado no
  logout).
- Autenticação de canal privado reusa a mesma instância `http` (mesmo
  tratamento de cookie/XSRF de qualquer outra requisição) contra
  `POST /broadcasting/auth` — nunca um segundo cliente HTTP.
- **Gap de documentação:** vários comentários no código (`echo.ts`,
  `useRestaurantRealtime.ts`) apontam para um `docs/realtime.md` com o
  catálogo de eventos — esse arquivo **não existe** no repositório hoje.
  Vale criá-lo numa tarefa dedicada (fora do escopo deste documento).

## 11. i18n (`src/i18n/`)

- `createI18n` com `legacy: false`, locale inicial persistido
  (`getPersistedLocale`), fallback `es-ES`.
- Só traduz chrome de interface — conteúdo de restaurante (produtos,
  categorias, menu) é traduzido pelo **backend**, nunca por aqui
  (CLAUDE.md §8).

## 12. Theming

- `src/stores/theme.ts` + tokens em três camadas (`src/styles/tokens.css`):
  primitivas de marca → roles de sistema Material 3 → shape/type scale.
  Ver `docs/design-system.md` para a autoridade visual completa.

## 13. Views e componentes

- Uma `View` por rota, em `src/views/<área>/`. Áreas espelham o domínio:
  `kitchen`, `menu`, `tables`, `service`, `staff`, `feedback`, `day-close`,
  `settings`, `analytics`, `public` (QR), `operation`.
- Componentes organizados por domínio em `src/components/<área>/` +
  `src/components/ui` (primitivos reutilizáveis), `src/components/shared`
  (compartilhados entre áreas) e `src/components/dashboard` (cartões/
  gráficos reutilizáveis — `MetricCard`, `SectionCard`, `EmptyState`,
  `DonutChart`, `BarList`, `ProgressRing`). Sempre checar esses três
  diretórios antes de criar um componente novo (CLAUDE.md §17).

## 14. Build & ambiente

- `src/config/env.ts` valida `import.meta.env` (modo-aware); `runtime.ts`
  exporta o `appConfig` resultante (API URL, config do Reverb, etc.) — é a
  única porta de entrada para variáveis de ambiente no app.
- Scripts reais (`package.json`): `dev`, `build`, `build:staging`,
  `build:production`, `preview`, `test:hardening`, `test:security`,
  `browser:install`. **Não existe** script `lint` — não inventar um.
