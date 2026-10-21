# QR: abertura automática da mesa

21 de outubro de 2026. Sem commit/push/deploy.

Atualização posterior: [validação no ambiente habitual](../../restaurants-api/docs/QR-local-validation-report.md), com API em localhost:8080, banco Docker local e pedido #654 pendente de aprovação.

O frontend agora chama POST de entrada antes da carta, guarda o vínculo da visita por QR/aba e o envia nas leituras, pedidos e solicitações. Polling e refresh não trocam para outra sessão. Sessão encerrada/paga mantém o pós-visita; uma nova visita exige ação explícita. Loading, retry manual, checkout bloqueado até a resposta e prevenção de duplo envio foram preservados/integrados aos componentes existentes.

O backend reutiliza `OpenTableAction`, serializa pela mesa e mantém o índice de uma sessão ativa. Pedidos seguem a configuração de aprovação vigente. Há uma migration para permitir ator público sem usuário fictício; ela só foi aplicada no PostgreSQL temporário local.

Build/TypeScript passaram. A suíte nova passou em 37 checks funcionais e 18 combinações de viewport/tema/idioma. Aprovação: 65 funcionais + 48 responsivos. Segurança: 54 checks. Hardening: 115 checks, 14 builds inválidos recusados e 2 válidos. Os testes HTTP simulados são separados da validação real, que abriu o QR, criou pedido waiting_approval e verificou reutilização, refresh, pós-visita e nova sessão vazia na API/PostgreSQL locais.

A skill local [ui-ux-pro-max](../.claude/skills/ui-ux-pro-max/SKILL.md) foi usada para planejar/revisar os estados visuais, conforme CLAUDE.md. Nenhum arquivo .env ou manifest/lockfile foi alterado nesta tarefa; mudanças anteriores foram preservadas.

O [relatório completo do workspace](../../restaurants-api/docs/QR-auto-open-report.md) contém causa raiz, segurança, concorrência, migration/rollback, todos os arquivos alterados nos dois repositórios, resultados, limitações de ambiente, passos manuais e os dois git status/diff --stat. O link é relativo ao workspace com ambos os projetos lado a lado.

## Arquivos desta tarefa no frontend

- `docs/QR-auto-open-report.md`
- `src/components/public/PublicPostVisitView.vue`
- `src/composables/usePublicEntryState.ts`
- `src/composables/usePublicMenu.ts`
- `src/composables/usePublicTableResolution.ts`
- `src/i18n/locales/ca-ES-valencia.ts`
- `src/i18n/locales/en-GB.ts`
- `src/i18n/locales/es-ES.ts`
- `src/services/public-table.service.ts`
- `src/utils/error-message.ts`
- `src/utils/public-visit-context.ts`
- `src/views/public/PublicTableView.vue`
- `tests/frontend-qr-entry.browser.ts`
- `tests/frontend-qr-entry.html`
- `tests/frontend-qr-entry.mjs`
