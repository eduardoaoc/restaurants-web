# Plan — Auditoria de Segurança Completa (restaurants-web)

Traduz `spec.md` em execução técnica concreta. Não introduz nenhuma
dependência nova, nenhum mecanismo de sanitização paralelo, nenhum contrato
de backend — conforme `constitution.md` §4.

## 1. Metodologia geral

Auditoria **estática e de configuração** (sem pentest ativo contra
staging/produção real, sem scan de rede externo — fora de escopo pelo
spec). Cada requisito do spec mapeia para um conjunto fixo de
`Grep`/`Read`/`Glob` sobre o código real + um comando de ferramenta já
disponível no ambiente (`npm`). Toda alegação no relatório final carrega
`arquivo:linha` como evidência — nunca uma afirmação sem referência ao
código.

Fluxo por área: **inspecionar → classificar achado (ou "sem achado") →
decidir ação** (corrigir agora / documentar gap de backend / aceitar como
não-risco com justificativa) **→ registrar no relatório**.

## 2. Mapeamento área → execução técnica

### 2.1 Rede / portas / dev server

- `Read vite.config.ts` (já lido na fase de constitution: `server.port =
  5174`, `strictPort: true`, sem `host: true`/`0.0.0.0`).
- `Grep` por `host:\s*true`, `0\.0\.0\.0`, `--host` em `vite.config.ts`,
  `package.json` (scripts), e qualquer `*.config.ts` adicional.
- `Read package.json` scripts (`dev`, `preview`, `build*`) — confirmar que
  nenhum passa `--host`.
- Verificar `dist/` **não é gerado/commitado** no repo (checar `.gitignore`
  já cobre `dist`, `dist-ssr`) — bundle de produção não deve ser inspecionado
  via grep de segredo diretamente no repo versionado, mas sim gerado sob
  demanda (`npm run build`) e então varrido (ver 2.2).

### 2.2 Segredos e configuração de ambiente

- `Read .env.example` — confirmar que todo valor é placeholder, não valor
  real (não ler `.env` real para o relatório — por contrato do spec, nunca
  copiar segredo real para fora; apenas confirmar via `ls`/existência que
  está no `.gitignore`, já confirmado na fase de constitution).
- `Grep` recursivo (excluindo `node_modules`, `dist`) por padrões de
  segredo: `AKIA[0-9A-Z]{16}`, `-----BEGIN PRIVATE KEY`, `sk_live_`,
  `password\s*=\s*['"]`, `secret\s*=\s*['"]`, em `src/`, raiz do projeto, e
  arquivos de config.
- `Read src/config/env.ts` — confirmar cobertura de `validateEnv()` para
  todos os `VITE_*` usados no projeto (cruzar com
  `Grep "import.meta.env.VITE_"` em `src/`) — qualquer `VITE_*` consumido no
  código que não passe por `validateEnv` é achado.
- Rodar `npm run build -- --mode production` (ou `build:production` já
  existente) **em modo de inspeção apenas** — se já há evidência suficiente
  via `validateEnv` + testes existentes (`frontend-hardening-build.mjs`),
  não é necessário rebuild completo só para a auditoria; usar os testes
  existentes como evidência primária e só buildar se uma dúvida específica
  exigir inspecionar o bundle gerado.

### 2.3 Auth, sessão, autorização

- `Grep "localStorage"` e `"sessionStorage"` em todo `src/` — para cada
  ocorrência, classificar o dado armazenado (tema/locale = ok; token/user
  credential = achado crítico).
- `Read src/api/http.ts`, `src/api/public-http.ts` — confirmar
  `withCredentials` correto em cada um.
- `Grep` por `Authorization`, `Bearer` em `src/` — qualquer ocorrência fora
  de teste/doc é achado crítico (constitution §4).
- `Read src/router/index.ts` — para cada rota sob `/app/*`, confirmar guard
  usa permissão vinda do backend (`authContext`/`permissions`), não
  `role === '...'` hardcoded. Cruzar com `CLAUDE.md §9` (gap conhecido:
  `/auth/me` ainda não retorna permissões — confirmar que o código atual
  não finge que retorna).
- `Read src/api/session.ts` — confirmar que o padrão de invalidação de
  resposta stale cobre todos os clients relevantes (`http`), não só uma
  rota específica.

### 2.4 XSS / injeção / open-redirect

- `Grep "v-html"` em `src/**/*.vue` — cada ocorrência é candidata a achado;
  avaliar se a fonte do conteúdo é confiável (texto do backend já
  sanitizado pelo backend) ou não.
- `Grep` por `href="` / `:href=` / `src="` / `:src=` dinâmico em
  `src/**/*.vue`, cruzando com uso (ou ausência) de `safeHttpUrl` —
  priorizar `src/components/public/*` e `src/views/public/*` (rotas de QR,
  conteúdo vindo direto do backend para cliente final, maior exposição).
- `Grep "window.location"`, `"router.push"`, `"router.replace"` — confirmar
  que nenhuma dessas chamadas usa valor de query string/resposta de API sem
  passar pelo guard já existente (`src/router/index.ts`) ou por
  `safeHttpUrl`.
- `Grep "error.response.data"`, `"err.response"` fora de
  `src/api/errors.ts` — qualquer leitura direta de erro bruto fora do
  normalizador é achado.

### 2.5 Dependências (supply chain)

- Rodar `npm audit --omit=dev` e `npm audit` (com dev deps) — capturar
  saída completa.
- Classificar achados por severidade reportada pelo npm
  (`critical`/`high`/`moderate`/`low`), e por aplicabilidade real (ex.:
  vulnerabilidade só em devDependency de build local vs. algo que entra no
  bundle de produção).
- Se `npm audit` não estiver disponível/falhar no ambiente, registrar como
  limitação explícita no relatório — não é erro fatal da auditoria (spec
  §2, "Dependências").

### 2.6 Headers e armazenamento no cliente

- `Read index.html` — verificar meta tags existentes (`Content-Security-Policy`,
  `referrer`), documentar ausências como gap (frontend pode adicionar meta
  CSP; headers HTTP reais como `X-Frame-Options`/HSTS são gap de
  backend/infra — documentar, nunca implementar workaround).
- Consolidar lista de `localStorage`/`sessionStorage`/cookies já levantada
  em 2.3, reapresentada aqui sob a ótica "storage" do spec (mesma varredura,
  seção diferente do relatório).

### 2.7 Formulários e validação de input

- `Grep` por `<form`, `type="email"`, `required`, `maxlength`, `v-model` em
  componentes de formulário conhecidos (login, staff, settings, pedidos) —
  confirmar presença de validação client-side básica sem assumir que ela
  substitui a validação do backend.

## 3. Ferramentas e dependências

- **Nenhuma dependência nova.** `npm audit` já vem com o `npm` do projeto.
  `Grep`/`Read`/`Glob` são suficientes para toda a análise estática — nada
  de instalar scanner externo (ex. `snyk`, `eslint-plugin-security`) sem
  decisão explícita do usuário, que já foi perguntada e respondida
  ("sem restrição formal além do já escrito") na fase de constitution.

## 4. Formato do relatório

Arquivo: `docs/security-audit-restaurants-web.md` (consistente com o padrão
já usado no repo — `docs/architecture.md`, `docs/business-rules.md`,
`docs/QR-waiter-approval-fix-report.md`).

Estrutura:

```
# Auditoria de Segurança — restaurants-web

## Resumo executivo
(contagem de achados por severidade; veredito geral)

## Metodologia e escopo
(o que foi e não foi coberto — espelha plan.md §1)

## Achados
### [SEVERIDADE] Título do achado
- Evidência: arquivo:linha
- Descrição
- Impacto
- Status: corrigido nesta tarefa | documentado como gap de backend | aceito como não-risco (justificativa)
- (se corrigido) Diff/arquivo alterado

## Superfície de rede / portas
## Dependências (npm audit)
## Itens fora de escopo / gaps de backend
```

Escala de severidade: **Crítico** (exploração direta: segredo exposto,
bypass de auth, XSS refletido real) / **Alto** (exploração com
pré-condição plausível) / **Médio** (hardening recomendado, sem exploração
direta demonstrada) / **Baixo** / **Informativo** (já mitigado, citado para
registro).

## 5. Padrão de correção por categoria (quando houver achado real)

- **URL não sanitizada** → envolver com `safeHttpUrl` (import de
  `src/utils/safe-url.ts`), nunca escrever uma nova função de sanitização.
- **Erro exibido sem normalizar** → rotear pela função já existente em
  `src/api/errors.ts` (`normalizeApiError`), nunca ler
  `error.response.data` diretamente no componente.
- **`VITE_*` fora de `validateEnv`** → estender `validateEnv()` em
  `src/config/env.ts` para cobrir a variável, seguindo o mesmo padrão de
  validação (host allowlist/HTTPS-only fora de dev) já usado para
  `VITE_API_URL`/`VITE_PUBLIC_APP_URL`/Reverb.
- **Dependência vulnerável com fix disponível** → `npm update <pacote>` (ou
  bump de versão mínima necessária em `package.json`) seguido de
  `npm run build` + `npm run test:security` + `npm run test:hardening`.
- **Gap que só o backend resolve** (header HTTP, CORS, rate limit, campo de
  permissão ausente em `/auth/me`) → nunca corrigir no frontend; apenas
  documentar na seção "Itens fora de escopo / gaps de backend" do relatório.

## 6. Não-regressão

Após qualquer correção aplicada: `npm run build`, `npm run test:security`,
`npm run test:hardening` devem passar antes de considerar o achado como
"corrigido nesta tarefa" no relatório. Se uma correção exigir estender uma
suíte de teste existente (ex.: novo caso em
`tests/frontend-security.browser.ts`), seguir o padrão de teste já usado
nesse arquivo (fixtures locais, sem rede real).
