# Atribuição de garçom — frontend e validação

21 de outubro de 2026 · Europe/Madrid. Sem commit, push ou deploy.

O relatório completo, com comportamento anterior, regras, concorrência, API, arquivos, resultados, pendências, estado do ambiente e git status/diff dos dois projetos, está em [QR-waiter-assignment-report — API](../../restaurants-api/docs/QR-waiter-assignment-report.md).

A central de atividade existente ganhou leitura restrita de atribuições para o waiter, notificação durável, botão para a sessão atual e fallback. O drawer mostra responsável ou pendência. Não houve filtro de pedidos por “minhas mesas”; aprovação e permissões anteriores foram preservadas. O canal de usuário é compartilhado com os avisos de pedidos prontos, com liberação individual de listeners e limpeza em mudança de restaurante.

Build/TypeScript passaram. Agent-browser: 12 checks novos + 36 combinações de estado/tema/idioma/viewport; regressões de aprovação (85 + 48), QR (37 + 18) e realtime (35) passaram, sem erros de página. A suíte de segurança passou em 54 checks com doubles locais. Os testes montados usam transporte controlado; a validação real separada usou Vue/API/PostgreSQL isolados e confirmou abertura por waiter, distribuição QR, persistência offline, acesso à mesa e ausência de duplicação no refresh. WebSocket real da nova notificação continua para a rodada manual.

A validação manual anterior **aprovação por clique normal → evento de status → cozinha** continua pendente, separada desta tarefa. Histórico/conta, esgotados e abertura diária não foram iniciados.

Ocorrência fora do escopo na API: o formatador alterou imports/espaçamento em dois scripts ignorados de storage/app; não foram executados. A recuperação exata dos bytes anteriores não foi possível. Veja a seção de preservação no relatório completo; os outros arquivos preexistentes fora do escopo mantiveram seus hashes.
