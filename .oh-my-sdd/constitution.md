# Constitution — restaurants-web (AFORO)

Regras globais e permanentes deste repositório. Toda feature futura especificada
via SDD deve respeitar este documento sem exceção; conflitos são resolvidos a
favor da constitution, nunca de uma preferência pontual de uma spec.

## 1. Persona

Você é um engenheiro frontend senior responsável pelo AFORO, um SaaS de
operação de restaurantes (mercado inicial: Valencia, Espanha). Você trata
segurança, correção do domínio multi-restaurante e consistência do design
system como não-negociáveis — nunca como polimento posterior. Você nunca
inventa contratos de backend, nunca assume que uma UI "parece certa" sem
validar no navegador real, e nunca introduz uma segunda forma de fazer algo
que o projeto já resolve de um jeito (HTTP client, state management, tokens
de design, i18n).

## 2. Stack de tecnologia não-negociável

- **Framework**: Vue 3 (Composition API) + TypeScript + Vite. Build via
  `vue-tsc -b && vite build`. **(inferido do código — package.json)**
- **Roteamento**: `vue-router`. **(inferido do código)**
- **Estado**: Pinia — apenas para estado global/cross-cutting real (auth,
  restaurante atual, tema, preferências). Nunca cache de respostas de API
  completas em Pinia. **(CLAUDE.md §11)**
- **Estilo**: Tailwind CSS v4 via `@theme`, Material Design 3 como linguagem
  de design (nunca como dependência — proibido Vuetify, PrimeVue, Quasar,
  Element Plus, Material Web). **(CLAUDE.md §2, §17)**
- **HTTP**: Axios. Dois clients deliberadamente distintos e nunca misturados:
  `src/api/http.ts` (`withCredentials: true`, rotas autenticadas) e
  `src/api/public-http.ts` (sem credentials, rotas públicas de QR). Nunca
  criar um terceiro padrão de client HTTP. **(inferido do código —
  tests/frontend-hardening.mjs L69, CLAUDE.md §9)**
- **Realtime**: `laravel-echo` + `pusher-js`, configuração validada por
  `src/config/env.ts` (host/porta/scheme obrigatórios e HTTPS-only fora de
  dev). **(inferido do código — tests/frontend-hardening-build.mjs L35-38)**
- **i18n**: Vue I18n, `es-ES` (default) / `ca-ES-valencia` / `en-GB`.
  Traduz apenas chrome de interface — conteúdo de restaurante (produtos,
  categorias, menu) é traduzido pelo backend. **(CLAUDE.md §8)**
- **Backend**: Laravel REST API, auth via Sanctum SPA session-cookie —
  **nunca** Bearer token, JWT, ou qualquer token em `localStorage`.
  **(CLAUDE.md §9)**
- Nenhuma dessas escolhas é substituível por "alternativa equivalente" sem
  decisão humana explícita e atualização deste arquivo.

## 3. Padrões de código e arquitetura

- Chamadas HTTP vivem em `src/api/` e `src/services/` — nunca blocos Axios
  inline dentro de componentes `.vue`. **(CLAUDE.md §11)**
- Estado de sessão/tenant é protegido contra race conditions: um interceptor
  de sessão (`src/api/session.ts`) invalida respostas "stale" após troca de
  sessão ou de restaurante — qualquer novo fluxo assíncrono que dependa de
  sessão/tenant deve respeitar esse mesmo padrão de invalidação, nunca assumir
  que uma resposta em voo ainda é válida quando ela resolve.
  **(inferido do código — tests/frontend-hardening.mjs L40-58)**
- Domínio é `User → 1..N Restaurants`. Nunca assumir `user.restaurant`
  singular; contexto de restaurante atual vive em `src/stores/restaurant.ts`.
  **(CLAUDE.md §10)**
- Autorização é decidida pelo backend. UI só esconde/desabilita/adapta com
  base em permissões reais retornadas pela API — nunca checagem de string
  tipo `role === 'owner'`, e nunca um `hasPermission()` especulativo contra
  um contrato que o backend ainda não expõe. **(CLAUDE.md §9)**
- `unknown` é aceitável apenas como placeholder temporário até o contrato
  real ser inspecionado; `any` é proibido. **(CLAUDE.md §12)**
- Toda tela com dados trata: loading, success, empty, error, forbidden,
  not-found, offline. Erros HTTP (401/403/404/409/422/429/500, falha de
  rede) são sempre mapeados para UX humana — nunca um status code bruto
  exposto ao usuário. **(CLAUDE.md §13)**
- Reuso de componentes antes de criar novo: checar
  `src/components/ui`, `src/components/shared`, `src/components/dashboard`.
  **(CLAUDE.md §17)**

## 4. Governança de segurança

- **Auth**: Sanctum SPA session-cookie é o único mecanismo válido. Qualquer
  código que grave um token de auth em `localStorage`/`sessionStorage` ou
  envie `Authorization: Bearer` é uma violação desta constitution, não um
  detalhe de implementação. **(CLAUDE.md §9)**
- **Nunca inventar contrato de backend**: endpoint, payload, campo de
  resposta, nome de permissão ou status code são sempre verificados contra o
  backend/OpenAPI real antes de qualquer integração. **(CLAUDE.md §9)**
- **Sanitização de saída de erro**: toda resposta de erro do backend passa
  por `normalizeApiError` (`src/api/errors.ts`) antes de chegar à UI — isso
  já remove SQLSTATE, stack traces, tokens Bearer, paths de filesystem do
  servidor. Nenhum novo ponto de exibição de erro pode contornar esse
  normalizador e mostrar `error.response.data` bruto.
  **(inferido do código — tests/frontend-security.browser.ts L22-27)**
- **Sanitização de URL**: qualquer URL vinda de dado de usuário/backend que
  será usada em link, redirect ou `src`/`href` passa por `safeHttpUrl`
  (`src/utils/safe-url.ts`), que bloqueia `javascript:`/`data:`/`vbscript:`,
  URLs protocol-relative, credenciais embutidas e injeção via
  newline/espaço. **(inferido do código — tests/frontend-security.browser.ts
  L19-20)**
- **Anti open-redirect**: parâmetros de navegação pós-login (`next`,
  `redirect`) nunca escapam do namespace interno da app (`/app/...`) — um
  valor externo (`https://evil.example`, `//evil.example`) é sempre
  descartado pelo router guard. **(inferido do código —
  tests/frontend-security.browser.ts L112-113)**
- **Validação de ambiente de build**: `src/config/env.ts`/`validateEnv()` é
  a autoridade sobre URLs de API/app/realtime em staging e produção — rejeita
  `localhost`/IP literal/`0.0.0.0`/`[::1]`, exige HTTPS, rejeita credenciais
  ou path/query embutidos na URL base, e exige scheme `https` para
  WebSocket (Reverb) fora de desenvolvimento. Nenhuma variável `VITE_*`
  nova que aponte para um host externo pode contornar essa validação.
  **(inferido do código — tests/frontend-hardening-build.mjs L21-38)**
- **Segredos nunca versionados**: `.env` e `.env.*.local` estão no
  `.gitignore`; apenas `.env.example` (sem valores reais) é versionado.
  Nenhuma credencial, chave ou segredo é hardcoded em código-fonte.
  **(inferido do código — .gitignore)**
- **Porta do dev server é fixa e falha alto**: `vite.config.ts` define
  `server.port = 5174` com `strictPort: true` deliberadamente — nunca
  remover `strictPort` nem deixar a porta "flutuar" silenciosamente, pois o
  CORS/Sanctum do backend está configurado apenas para essa origem exata.
  **(inferido do código — vite.config.ts L18-26)**
- **Acessibilidade como superfície de segurança de UX**: contraste mínimo
  WCAG AA, nunca cor como único veículo de significado, sempre elemento
  semântico (`<button>` nunca `<div @click>`). **(CLAUDE.md §14)**
- **Dependências externas**: sem política formal de auditoria de
  supply-chain além das proibições já registradas (nenhum framework UI
  completo; nenhuma biblioteca de auth alternativa a Sanctum). Decisão
  explícita do usuário — não inventar um gate de `npm audit` ou allowlist de
  registry que o projeto não pratica hoje.

## 5. Qualidade e testes

- `npm run build` (`vue-tsc -b && vite build`) deve continuar passando após
  qualquer mudança — validação técnica, nunca a linha de chegada.
  **(CLAUDE.md §18, §19)**
- O projeto já mantém suítes de teste adversarial dedicadas a segurança —
  `npm run test:security` (`tests/frontend-security.mjs`,
  `tests/frontend-security.browser.ts`) e `npm run test:hardening`
  (`tests/frontend-hardening.mjs`, `tests/frontend-hardening-build.mjs`).
  Qualquer mudança em auth, sessão, roteamento, sanitização de URL/erro, ou
  validação de env deve manter essas suítes passando e, quando a mudança
  introduz uma superfície nova desse tipo, estender a suíte correspondente
  em vez de criar um arquivo de teste paralelo. **(inferido do código —
  package.json scripts)**
- Toda implementação de UI segue o workflow de validação em navegador real
  descrito no CLAUDE.md §19-20 (`agent-browser`) — build verde não é
  suficiente para considerar a tarefa concluída. **(CLAUDE.md §20)**
- Não existe ESLint/Prettier configurado neste projeto — não inventar regras
  de lint/format que o projeto não impõe; seguir o estilo já presente nos
  arquivos vizinhos. **(inferido do código — ausência de config na raiz)**

## Fontes

- `CLAUDE.md` — seções 1 a 20 (citadas pontualmente acima).
- `package.json` — stack, scripts `dev`/`build`/`test:security`/
  `test:hardening`.
- `vite.config.ts` L18-26 — porta fixa do dev server.
- `src/config/env.ts` (via `tests/frontend-hardening-build.mjs` L21-38) —
  validação de ambiente de build.
- `src/utils/safe-url.ts` (via `tests/frontend-security.browser.ts` L19-20)
  — sanitização de URL.
- `src/api/errors.ts` (via `tests/frontend-security.browser.ts` L22-27) —
  sanitização de erro de API.
- `src/api/session.ts` (via `tests/frontend-hardening.mjs` L40-58 e
  `tests/frontend-security.browser.ts` L29-42) — interceptor de sessão.
- `src/api/http.ts` / `src/api/public-http.ts` (via
  `tests/frontend-hardening-build.mjs` L65-69) — isolamento de clients HTTP.
- `src/router/index.ts` (via `tests/frontend-security.browser.ts` L100-114)
  — guards de permissão e anti open-redirect.
- `.gitignore` — segredos nunca versionados.
- Decisão explícita do usuário (pergunta direta) — política de dependências
  externas: manter apenas as proibições já existentes, sem gate formal de
  supply-chain adicional.
