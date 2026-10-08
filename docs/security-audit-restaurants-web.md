# Auditoria de Segurança — restaurants-web

Data: 2026-10-09. Repositório: `restaurants-web` (AFORO frontend).
HEAD no início: `a03e10e` (`docs: add architecture and business-rules
documentation`), com a working tree no mesmo estado parcialmente não
commitado descrito em `docs/QR-waiter-approval-fix-report.md`
(aprovação de pedidos QR). Execução somente local — sem login em
staging/produção real, sem scan de rede externo, sem alteração de backend.

## Resumo executivo

- **Crítico: 0. Alto: 0 (1 corrigido nesta auditoria). Médio: 0. Baixo: 0.
  Informativo: 2.**
- Esta auditoria build sobre uma base já bastante hardened: um relatório
  anterior completo (`docs/PR-SEC1B-frontend-adversarial-security-report.md`,
  2026-10-04) já cobriu XSS, storage, route guards, tenant staleness,
  sessão/CSRF, open redirect, exposição de QR/token, CSP/clickjacking,
  disclosure de erro, upload e duplicate submissions — com correções
  aplicadas e testadas. Esta auditoria **revalidou** essas áreas contra o
  código atual (incluindo arquivos modificados desde então pela correção de
  aprovação de pedidos QR) e não encontrou regressão.
- Único achado real com ação: dependência transitiva `source-map-js@1.2.1`
  com vulnerabilidade **High** (DoS) reportada por `npm audit` — **corrigida
  nesta auditoria** via `npm audit fix` (bump para `1.2.2`, sem mudança de
  versão maior). `npm audit` agora reporta 0 vulnerabilidades.
- Nenhum item exigiu mudança de contrato de backend. Os gaps que só o
  backend pode resolver (headers HTTP CSP/HSTS/X-Frame-Options, CORS,
  permissões em `/auth/me`) já estavam documentados no relatório anterior e
  permanecem como pendência de backend — não implementados aqui como
  workaround frontend.

## Metodologia e escopo

Auditoria estática (código + configuração) + `npm audit`, sem pentest
ativo contra ambiente real. Mapeamento completo em
`.oh-my-sdd/specs/security-audit-restaurants-web/plan.md`. Áreas cobertas:
rede/portas, segredos/env, auth/sessão/autorização, XSS/open-redirect,
sanitização de erro, dependências (supply chain), headers/storage,
formulários. Fora de escopo (conforme spec): pentest ativo, scan de rede
externo, qualquer mudança de backend/CORS/Sanctum.

## Achados

### [Alto → Corrigido] Dependência transitiva vulnerável: `source-map-js@1.2.1`

- Evidência: `npm audit` → GHSA-68fv-2mgg-jv7q, CVSS 7.5, CWE-1284
  (event-loop DoS via offsets de seção indexada em source map). Cadeia:
  `@tailwindcss/vite` → `@tailwindcss/node`; `vite` → `postcss`; `vue-i18n`
  → `@intlify/message-compiler`; `vue-router` → `@vue/compiler-sfc` — todas
  dependências de **build-time**, nunca executadas no navegador do
  cliente/runtime da SPA servida.
- Descrição: versão vulnerável do `source-map-js` (`1.0.0 - 1.2.1`)
  presente via dedupe em 4 cadeias de dependência de build.
- Impacto real: baixo na prática (só explorável se o próprio processo de
  build consumir um source map malicioso; não é superfície de ataque do
  app em produção), mas a correção é trivial e sem risco — não deixar
  acumular.
- Status: **corrigido nesta tarefa**. `npm audit fix` aplicou
  `source-map-js 1.2.1 → 1.2.2` (patch, sem mudança de major) e removeu
  `@emnapi/wasi-threads@1.2.3` (dependência opcional não mais necessária).
  `package.json`/`package-lock.json` atualizados. `npm audit --json` pós-fix:
  `{"vulnerabilities": {}, "total": 0}`.

### [Informativo] Arquivo órfão vazio `t.txt` na raiz do repositório

- Evidência: `t.txt` (0 bytes), untracked, raiz do projeto.
- Descrição: arquivo sem conteúdo, sem referência em nenhum lugar do
  código ou configuração — aparenta ser artefato acidental de uma sessão
  anterior.
- Impacto: nenhum (não é segredo, não é executável, não afeta build).
  Citado apenas como higiene de repositório.
- Status: **não removido nesta tarefa** — fora do escopo de "achado de
  segurança real"; decisão de limpeza deixada para o usuário.

### [Informativo] `tailwindcss`/`@tailwindcss/vite` classificados em `dependencies`

- Evidência: `package.json` — ambos em `dependencies`, não
  `devDependencies`, embora sejam ferramentas de build (Tailwind v4 via
  plugin Vite, nunca importado em runtime do bundle servido).
- Já identificado no relatório anterior (`PR-SEC1B`, seção DEPENDENCIES)
  como melhoria de classificação, sem finding de vulnerabilidade associado.
- Status: **sem mudança nesta tarefa** — reclassificar exigiria editar
  `package.json`/lockfile por uma razão de higiene, não de segurança; a
  classificação em `dependencies` **não** causa exposição real (essas
  libs não entram no bundle do cliente, conforme já confirmado no scan de
  dist do relatório anterior).

## Superfície de rede / portas

- `vite.config.ts`: `server.port = 5174`, `strictPort: true`. Nenhum
  `host: true`/`--host`/bind em `0.0.0.0` em nenhum script ou config —
  dev server escuta apenas em `localhost:5174`, nunca exposto à rede
  local. Porta fixa é deliberada (backend/Sanctum CORS só aceita essa
  origem exata) e falha alto em vez de drift silencioso.
- Scripts de build (`build`, `build:staging`, `build:production`,
  `preview`) não passam flag de exposição de rede.
- Bundle de produção não foi regerado nesta auditoria (sem dúvida
  específica que justificasse — `src/config/runtime.ts`/`env.ts`, o único
  ponto de acesso a `import.meta.env`, está inalterado desde o scan de
  dist do relatório anterior, que já confirmou 0 secrets/`.map`/markers em
  91 arquivos do build final). `npm run build` desta auditoria (seção
  Dependências/Não-regressão) serve como confirmação adicional de que o
  build continua íntegro.

## Dependências (npm audit)

| Momento | Total | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- | --- |
| Antes desta auditoria | 1 | 0 | 1 | 0 | 0 |
| Depois do fix | 0 | 0 | 0 | 0 | 0 |

`npm audit fix` foi suficiente (patch version, sem `--force`, sem mudança
de major, sem dependência nova instalada).

## Itens fora de escopo / gaps de backend (carregados do relatório anterior, sem mudança)

Estes seguem como pendência de infraestrutura/backend, não resolvíveis no
frontend, e **não foram re-abertos nem workaround-eados** nesta auditoria:

- Headers HTTP reais: `Content-Security-Policy`, `X-Frame-Options`/
  `frame-ancestors`, `HSTS`, `X-Content-Type-Options: nosniff` — inventário
  completo de diretivas CSP já está em
  `docs/PR-SEC1B-frontend-adversarial-security-report.md` §CSP
  REQUIREMENTS. Hash do script inline de tema (`sha256-...`) deve ser
  recalculado a cada build de produção real, não reaproveitado de um hash
  antigo.
- CORS/cookies (`HttpOnly`/`Secure`/`SameSite`) do backend/Sanctum —
  requer inspeção em staging real, não a partir do source frontend.
- `/api/v1/auth/me` ainda não retorna roles/permissions/capabilities
  (gap já documentado em `CLAUDE.md §9`) — toda UI de permissão continua
  dependendo de 403 real do backend, nunca de checagem de `role` no
  frontend.
- Mensagens de erro públicas do backend: o normalizador frontend
  (`src/api/errors.ts`) é defesa adicional, não garantia universal —
  backend deve continuar nunca devolvendo stack/SQL/segredo em texto livre.
- Origem de mídia HTTP (não HTTPS) em staging/produção — já identificada
  como correção pendente do backend no relatório anterior.

## Não-regressão

Executado após a correção da dependência:

| Comando | Resultado |
| --- | --- |
| `npm audit` | PASS — 0 vulnerabilities |
| `npm run build` | PASS — build em 2.99s |
| `npm run test:security` | PASS — 54 checks adversariais |
| `npm run test:hardening` | PASS — 115 checks + 14 builds inválidos rejeitados + 2 builds HTTPS/WSS válidos |

## Addendum — aprofundamento em vazamento de dado/token/credencial e múltiplas requisições

A pedido do usuário, depois da primeira passada, foram feitas checagens
adicionais focadas especificamente em (a) qualquer vazamento de dado,
token ou credencial, e (b) problemas de múltiplas requisições/race
conditions — ainda inteiramente no frontend (`restaurants-web`), sem
backend/infra.

- **Logging**: `Grep "console\.(log|warn|error|info|debug)"` em todo
  `src/` — zero ocorrência em código de aplicação real (a única é no
  protótipo órfão `src/views/aforo-dashboard.html`, fora do bundle). Nenhum
  dado sensível pode vazar via console/ferramentas de erro externas por
  esse caminho.
- **Source maps**: `vite.config.ts` não define `build.sourcemap`
  (default do Vite é `false`); `dist/` gerado nesta auditoria não contém
  nenhum `.map`. Sem vetor de vazamento de source via mapa de build.
- **Histórico completo do git** (45 commits, `git log --all -p`): scan por
  padrões de segredo (`AKIA...`, `BEGIN PRIVATE KEY`, `sk_live_`, `xox[baprs]-`,
  `AIza...`, `password=`, `secret=`) não encontrou nenhum segredo real —
  os únicos matches são strings de i18n ("Mostrar/Ocultar contraseña").
  `git log --all --diff-filter=A --name-only` confirma que `.env` (real)
  **nunca** foi adicionado em nenhum commit do histórico — só
  `.env.example`. Ou seja, não há segredo "removido mas ainda recuperável"
  no histórico.
- **Fluxo do token público (QR)**: `publicToken` trafega só no path da URL
  (`/api/v1/public/tables/{publicToken}/...`), nunca em query string nem
  body desnecessário; `publicHttp` nunca carrega cookie de sessão
  (`withCredentials` no default `false`); criação de pedido usa header
  `Idempotency-Key` gerado uma vez por tentativa de checkout — um retry de
  rede repete a MESMA tentativa (200) em vez de criar pedido duplicado.
- **Race conditions / múltiplas requisições** (reexaminado especificamente
  no código novo desta sessão, `useOrderApprovals.ts`): guard de
  single-flight por pedido (`actingOn[order.id]`) impede um segundo
  approve/reject simultâneo no mesmo pedido; `AbortController` +
  `scopeGeneration` descartam qualquer GET/POST cuja resposta chegue depois
  de uma troca de restaurante ou de uma mutação mais recente — mesmo padrão
  do interceptor de sessão (`src/api/session.ts`), que já rejeita qualquer
  resposta cuja `version` capturada na saída da requisição não bate mais
  com a versão atual da sessão.
- **Polling**: único ponto de `setInterval` contra a API pública
  (`src/views/public/PublicTableView.vue`, resolução de pagamento/conta) —
  um único timer (nunca duplicado), intervalo de 12s, pausado quando a aba
  fica em background (`visibilitychange`), aborta a requisição anterior
  antes de iniciar a próxima, e limpo no unmount. Sem risco de empilhar
  requisições ou gerar flood contra o backend.

Conclusão do addendum: nenhum achado adicional de vazamento de
dado/token/credencial, nem de corrida/duplicação de requisição, no código
frontend atual (incluindo o trabalho não commitado desta sessão). Os
limites já declarados no corpo deste relatório continuam de pé — isto
segue sendo uma auditoria estática do frontend, não um pentest contra
staging/produção real nem uma auditoria do backend.

## Addendum 2 — varredura final por ponto crítico remanescente

Última rodada, a pedido do usuário ("algum ponto crítico"), cobrindo
vetores ainda não checados explicitamente nas rodadas anteriores:

- **`eval`/`new Function`**: zero ocorrência em `src/`.
- **`fetch()` nativo cru**: zero ocorrência — toda função chamada `fetch`
  encontrada no código é um nome de função local de composable (ex.:
  `useRestaurantMenu.ts`, `useOrderApprovals.ts`), nunca a API global
  `fetch`; todo HTTP real passa pelos clients Axios governados
  (`http`/`publicHttp`), nunca os contorna.
- **`postMessage`/listener de `message`**: zero ocorrência — sem superfície
  de postMessage sem validação de origem.
- **Componentes dinâmicos (`:is`)**: todas as ~18 ocorrências resolvem para
  um componente/ícone já importado estaticamente no módulo (ex.:
  `item.icon`, `ALLERGEN_ICON[code]`, `PhCheckCircle`) ou para uma string
  literal fixa (`ASurface`'s prop `as`, default `'div'`, sempre passada
  como literal no call site) — nenhum `:is` é alimentado por texto vindo
  do backend/usuário, então não há injeção de componente arbitrário.
- **`dangerouslySetInnerHTML`/atribuição de `innerHTML`/`outerHTML`**: zero
  ocorrência (reconfirma o achado original de XSS sinks).
- **`JSON.parse` de dado local**: as 2 ocorrências em composables reais
  (`usePublicCart.ts`, `usePublicFeedbackToken.ts`) só leem o
  **próprio** `localStorage` do dispositivo (nunca dado de rede não
  confiável) e já estão em `try/catch`; não alimentam nenhuma decisão de
  autorização.
- **Dependência fora de lugar — `oh-my-sdd@1.0.0` em `dependencies`**:
  confirmado via `npm view oh-my-sdd` que é o pacote legítimo publicado
  (`github.com/slpascoal/oh-my-sdd`, mesma versão instalada — **não** é
  dependency confusion/typosquatting). Porém é a ferramenta de CLI do
  próprio workflow de SDD usada para orquestrar esta tarefa, não algo que
  o app importa: `Grep "oh-my-sdd"` em `src/` não tem nenhum resultado.
  Estar em `dependencies` (em vez de `devDependencies`) significa que ela
  É instalada num `npm ci --omit=dev`/produção, sem necessidade — aumenta
  a superfície de supply-chain da instalação de produção sem motivo
  funcional. **Severidade: Baixa/informativa** (pacote real, não
  executado pelo app, Vite não inclui módulo não importado no bundle) —
  mas é uma correção de classificação simples (mover para
  `devDependencies`) que não foi aplicada nesta auditoria por estar fora
  do que foi pedido como "achado de segurança"; sinalizando para decisão
  do usuário.

**Conclusão: nenhum ponto crítico ou de alta severidade remanescente foi
encontrado no frontend.** O único item real desta auditoria completa foi a
dependência `source-map-js` (High, já corrigida). O único ponto aberto
sem ação é de classificação/hygiene (`oh-my-sdd` em `dependencies`), não
uma vulnerabilidade.

## Arquivos alterados nesta auditoria

`package.json`, `package-lock.json` (bump `source-map-js` 1.2.1 → 1.2.2,
remoção de `@emnapi/wasi-threads` não mais necessário), `docs/security-audit-restaurants-web.md` (este relatório). Nenhum
código de aplicação foi alterado — todos os achados fora da dependência
foram confirmados como já mitigados pelo trabalho de hardening anterior.
