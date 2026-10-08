# Tasks — Auditoria de Segurança Completa (restaurants-web)

## Tasks

- [x] 1. Auditar rede/portas: ler `vite.config.ts` e scripts de `package.json`; `Grep` por `host:\s*true`, `0\.0\.0\.0`, `--host` em todo o projeto (exceto `node_modules`); registrar achado (ou ausência) na seção "Superfície de rede / portas" do relatório.
- [x] 2. Auditar segredos: ler `.env.example` e confirmar que só tem placeholders; `Grep` recursivo (exceto `node_modules`, `dist`) por padrões de segredo (`AKIA[0-9A-Z]{16}`, `-----BEGIN PRIVATE KEY`, `sk_live_`, `password\s*=\s*['"]`, `secret\s*=\s*['"]`); confirmar `.gitignore` cobre `.env`/`.env.*.local`.
- [x] 3. Auditar cobertura de `validateEnv()`: `Grep "import.meta.env.VITE_"` em `src/`, cruzar cada variável encontrada com `src/config/env.ts`; listar qualquer `VITE_*` consumido sem validação equivalente.
- [x] 4. Auditar auth/storage: `Grep "localStorage"` e `"sessionStorage"` em todo `src/`; classificar cada ocorrência (preferência vs. segredo de auth); `Grep` por `Authorization`/`Bearer` em `src/`.
- [x] 5. Auditar clients HTTP e router guards: ler `src/api/http.ts`, `src/api/public-http.ts`, `src/router/index.ts`; confirmar `withCredentials` correto por client e que guards de `/app/*` usam permissão real do backend, não `role === '...'` hardcoded; confirmar padrão de invalidação de sessão em `src/api/session.ts`.
- [x] 6. Auditar XSS/open-redirect: `Grep "v-html"`, `href="`/`:href=`/`src="`/`:src=` dinâmico em `src/**/*.vue` (prioridade: `src/components/public/*`, `src/views/public/*`); `Grep "window.location"`, `"router.push"`, `"router.replace"`; confirmar uso de `safeHttpUrl` onde necessário.
- [x] 7. Auditar sanitização de erro: `Grep "error.response.data"`/`"err.response"` fora de `src/api/errors.ts`; confirmar que toda exibição de erro passa por `normalizeApiError`.
- [x] 8. Rodar `npm audit` (com e sem devDependencies) e classificar achados por severidade e aplicabilidade real (produção vs. build local); se a ferramenta falhar, registrar como limitação.
- [x] 9. Auditar headers/meta tags: ler `index.html`; documentar meta tags de segurança presentes/ausentes; separar claramente o que é gap de frontend vs. gap de backend/infra (headers HTTP reais).
- [x] 10. Auditar formulários: `Grep` por `<form`, `type="email"`, `required`, `maxlength`, `v-model` nos componentes de login/staff/settings/pedidos; confirmar validação client-side básica presente.
- [x] 11. Redigir `docs/security-audit-restaurants-web.md` consolidando todos os achados das tarefas 1–10, seguindo a estrutura definida em `plan.md` §4 (resumo executivo, metodologia, achados por severidade, rede/portas, dependências, gaps de backend).
- [x] 12. Para cada achado real classificado como "corrigir nesta tarefa": aplicar a correção reusando o mecanismo já existente correspondente (`safeHttpUrl`, `normalizeApiError`, extensão de `validateEnv`, bump de dependência) — nunca criar mecanismo paralelo; atualizar o relatório com o status final de cada achado.
- [x] 13. Rodar `npm run build`, `npm run test:security`, `npm run test:hardening` após as correções da tarefa 12 e confirmar que todos passam; se alguma correção precisar de novo caso de teste, estender a suíte existente correspondente seguindo o padrão já usado nela.
- [x] 14. Apresentar o relatório final ao usuário com o resumo executivo (contagem de achados por severidade e o que foi corrigido vs. documentado como gap de backend).
