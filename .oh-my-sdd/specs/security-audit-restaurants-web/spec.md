# Spec — Auditoria de Segurança Completa (restaurants-web)

## 1. Intenção e Visão Geral

O AFORO (restaurants-web) é um SaaS de operação de restaurantes em produção
de dados reais de clientes (pedidos, mesas, pagamentos, staff). Antes de
qualquer passo adicional de hardening, o time precisa de um retrato completo
e factual de onde a aplicação frontend está exposta: que portas/superfícies
de rede ficam abertas, se segredos podem escapar para o cliente ou para o
repositório, se os guard-rails de segurança que já existem no código (ex.:
`safeHttpUrl`, `normalizeApiError`, validação de `env`, isolamento de
clients HTTP) cobrem de fato todas as rotas/fluxos reais, e se há gaps
novos introduzidos desde a última revisão (`fix: harden frontend security
boundaries`, `feat: harden frontend for staging readiness`).

O objetivo desta feature **não é redesenhar a arquitetura de segurança**:
é produzir uma auditoria rastreável (achado → evidência → severidade) e
corrigir, dentro do próprio código já existente, apenas os achados reais e
confirmados — nunca um contrato de backend inventado, nunca uma mitigação
especulativa para algo que o backend já resolve.

Fora de escopo: qualquer mudança no backend Laravel (o frontend não pode
alterar CORS, Sanctum, headers de resposta do servidor, rate limiting de
API — apenas documentar o gap e, se aplicável, a mitigação possível do lado
frontend). Fora de escopo também: pentest ativo contra o backend de
produção/staging real, scan de rede externo, ou qualquer ação que gere
tráfego não controlado contra infraestrutura de terceiros.

## 2. Requisitos Funcionais (EARS/GEARS)

### Superfície de rede / portas

- **When** a auditoria inspeciona a configuração do dev server (`vite.config.ts`)
  e dos scripts de build (`package.json`), o sistema **shall** reportar toda
  porta, host bind (`0.0.0.0` vs `localhost`) e flag de exposição de rede
  (`--host`) configurados, e se divergem do padrão documentado
  (`server.port = 5174`, `strictPort: true`).
- **If** algum script, config ou variável de ambiente versionada expõe o
  dev server para `0.0.0.0` ou para a rede local sem necessidade documentada,
  o sistema **shall** registrar esse achado com severidade proporcional ao
  risco real (dev-only vs exposição em build de produção).
- **When** a auditoria inspeciona os artefatos de build (`dist/` via
  `npm run build`), o sistema **shall** verificar se algum segredo, URL
  interna, ou variável sensível é embutido no bundle final servido ao
  cliente.

### Segredos e configuração

- **When** a auditoria varre o repositório, o sistema **shall** confirmar
  que nenhum segredo real (chave de API, senha, token) está commitado em
  código-fonte, histórico de git acessível, ou arquivo versionado — incluindo
  `.env.example` (que deve conter apenas placeholders).
- **If** uma variável `VITE_*` aponta para um host/URL que `validateEnv()`
  (`src/config/env.ts`) não valida ou valida incorretamente em algum modo de
  build (development/staging/production), o sistema **shall** registrar o
  gap como achado.

### Auth, sessão e autorização

- **When** a auditoria revisa o fluxo de auth, o sistema **shall** confirmar
  que nenhum token de sessão é armazenado em `localStorage`/`sessionStorage`
  e que todas as chamadas autenticadas usam o client `http` (com
  `withCredentials: true`) — nunca o `publicHttp`.
- **If** uma rota ou view sob `/app/*` for acessível sem que o router guard
  dependa de uma permissão real retornada pelo backend (e não de uma
  checagem de `role` hardcoded), o sistema **shall** registrar o achado.
- **While** uma sessão expira ou troca de restaurante/tenant está em
  andamento, o sistema **shall** confirmar que nenhuma resposta "stale" de
  uma requisição em voo antes da troca é aplicada ao estado da UI após a
  troca (cobertura real do padrão já testado em
  `tests/frontend-hardening.mjs`/`tests/frontend-security.browser.ts`).

### Sanitização de entrada/saída (XSS, injeção, open-redirect)

- **When** a auditoria varre o código por pontos de renderização de HTML
  dinâmico (`v-html`), interpolação em atributos `href`/`src`, ou uso de
  `window.location`/`router.push` com valor de origem externa (query
  string, resposta de API, conteúdo de restaurante), o sistema **shall**
  confirmar que o valor passa por `safeHttpUrl` (ou sanitização equivalente)
  antes de ser usado, ou registrar o achado se não passar.
  (**Nunca via rotas públicas de QR/menu**, onde conteúdo vem direto do
  backend e é renderizado para clientes finais — superfície prioritária.)
- **If** qualquer ponto de exibição de erro de API renderiza
  `error.response.data` bruto em vez de passar por `normalizeApiError`, o
  sistema **shall** registrar o achado.
- **When** a auditoria revisa parâmetros de navegação pós-login/pós-logout
  (`next`, `redirect` ou equivalentes), o sistema **shall** confirmar que
  nenhum valor externo ao namespace `/app/*` ou `/t/*` consegue escapar do
  guard de roteamento.

### Dependências (supply chain)

- **When** a auditoria inspeciona `package.json`/`package-lock.json`, o
  sistema **shall** executar uma verificação de vulnerabilidades conhecidas
  nas dependências (`npm audit` ou equivalente) e reportar achados por
  severidade — sem bloquear a auditoria caso a ferramenta não esteja
  disponível no ambiente (reportar como limitação, não como erro fatal).

### Headers e armazenamento no cliente

- **When** a auditoria revisa o HTML servido (`index.html`) e a configuração
  de build, o sistema **shall** verificar presença/ausência de meta tags de
  segurança aplicáveis do lado frontend (ex.: `Content-Security-Policy` via
  meta tag, `referrer` policy) — headers HTTP de servidor (CSP header,
  `X-Frame-Options`, HSTS) são responsabilidade do backend/infra e **shall**
  ser apenas documentados como gap a resolver fora do frontend, nunca
  implementados aqui como workaround.
- **When** a auditoria revisa uso de `localStorage`/`sessionStorage`/cookies
  no código frontend, o sistema **shall** listar todo dado persistido
  localmente e confirmar que nenhum é um segredo de auth (token, senha) —
  apenas preferências (tema, locale) conforme `CLAUDE.md §5`.

### Formulários e validação de input

- **When** a auditoria revisa formulários que coletam dado de usuário
  (login, staff, configurações, pedidos), o sistema **shall** confirmar que
  existe validação client-side básica (tipo, formato, limites) **e** que a
  aplicação não depende só dela — a validação do backend permanece
  autoritativa.

## 3. Critérios de Aceite

- [ ] Relatório de auditoria entregue em
  `docs/security-audit-restaurants-web.md` (ou local equivalente acordado),
  listando cada achado com: evidência (arquivo:linha), severidade
  (crítico/alto/médio/baixo/informativo), e status (corrigido nesta tarefa /
  documentado como gap de backend / aceito como não-risco com justificativa).
- [ ] Superfície de rede/portas do dev server e do build documentada
  explicitamente, com confirmação de que nada escuta em `0.0.0.0` sem
  necessidade.
- [ ] Confirmação explícita, com evidência, de que nenhum segredo real está
  versionado no repositório (código, `.env.example`, configs).
- [ ] Todos os pontos de uso de `v-html`, `href`/`src` dinâmico e navegação
  programática revisados quanto a sanitização; achados reais corrigidos
  usando os utilitários já existentes (`safeHttpUrl`), nunca um novo
  mecanismo paralelo.
- [ ] Todos os pontos de exibição de erro de API confirmados como passando
  por `normalizeApiError`; qualquer exceção corrigida.
- [ ] Resultado de verificação de dependências vulneráveis (`npm audit` ou
  equivalente) documentado no relatório, com decisão por achado (atualizar /
  aceitar risco documentado / não aplicável ao frontend).
- [ ] `localStorage`/`sessionStorage`/cookies usados no projeto auditados e
  confirmados livres de segredo de auth.
- [ ] Qualquer achado corrigido dentro desta tarefa mantém
  `npm run build`, `npm run test:security` e `npm run test:hardening`
  passando.
- [ ] Nenhuma mudança de contrato de backend foi inventada; gaps que só o
  backend pode resolver (headers HTTP, CORS, rate limiting) estão
  documentados no relatório como pendência de backend, não implementados
  como workaround frontend.
- [ ] Usuário validou o relatório final antes de qualquer correção ser
  considerada definitiva.

## 4. Requisitos Não-Funcionais e Contratos

- **Segurança (vinculante à constitution)**: toda correção aplicada nesta
  tarefa deve reusar os mecanismos já existentes e testados
  (`safeHttpUrl`, `normalizeApiError`, `validateEnv`, interceptor de sessão)
  — nunca introduzir um mecanismo de sanitização/validação paralelo. Nenhuma
  correção pode adicionar Bearer token, JWT, ou persistência de auth em
  `localStorage`.
- **Sem invenção de contrato de backend**: qualquer achado que dependa de
  mudança de API, header de resposta, CORS, ou permissão não exposta pelo
  backend é documentado como gap de backend no relatório — nunca mockado,
  nunca contornado no frontend como se fosse a solução real.
- **Dependências externas**: nenhuma biblioteca nova é adicionada só para
  a auditoria (ex.: scanner de segurança pesado) sem necessidade real —
  preferir ferramentas já disponíveis no ecossistema npm (`npm audit`) ou
  análise manual do código.
- **Não-regressão**: `npm run build`, `npm run test:security` e
  `npm run test:hardening` devem continuar verdes após qualquer correção.
- **Dado real sensível**: a auditoria não deve exfiltrar, logar ou persistir
  em texto plano nenhum dado real de cliente/restaurante encontrado durante
  a varredura (ex.: se um `.env` real contiver uma credencial válida, o
  relatório cita que existe o problema e sua localização — nunca copia o
  valor da credencial para o relatório ou para fora do ambiente local).
- **Idioma**: relatório e achados em português (consistente com esta
  sessão), nomes de arquivo/símbolos técnicos mantidos em inglês/original.
