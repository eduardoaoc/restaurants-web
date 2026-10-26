# Fase 3 — AAppShell v2

**Fonte visual:** `docs/design/DESIGN_SYSTEM.md`. O shell V2 permanece atrás de `VITE_SHELL_V2`; sem a variável (ou com `false`) a apresentação legado continua ativa. A configuração e os dados de navegação são compartilhados entre ambas.

## 1. Arquitetura

`AppShellLayout.vue` continua sendo a única integração global. Resolve a navegação, inicializa o restaurante e conecta atividade/notificações uma vez; seleciona `AAppShell` ou `LegacyAppShell` por configuração. O shell novo cuida apenas da apresentação e não recebe estado de domínio adicional.

## 2. Fonte única da navegação

`src/components/shell/navigation.ts` mantém uma lista permission-driven com destino, rota, chave i18n, ícone, grupo e prioridade. O mesmo array é particionado para bottom nav, rail, sidebar e “Mais”; o legacy também recebe a lista resolvida compartilhada.

Não há rota de operação “Sala” no router atual. O destino `Tables` mantém a função existente de configuração de mesas e a permissão `manage_tables`; o shell não inventa um destino. Como as permissões existentes não distinguem os perfis da matriz do Design System de modo confiável, usa uma ordem operacional única: Serviço, Painel, Cozinha, Fechamento, Carta, Mesas, Equipe, Avaliações e Ajustes. Cada item continua sujeito às permissões atuais.

## 3. Comportamento mobile

Em `<768px`, o DOM e a grade seguem topbar, conteúdo e bottom nav. Não há drawer como navegação primária nem título de página repetido na topbar. A bottom nav mostra até quatro destinos elegíveis e “Mais”. Labels permanecem visíveis; controles têm mínimo de 48 px, ícones 24 px, área ativa usa `primary-subtle` e peso maior, com `aria-current="page"`.

## 4. Bottom navigation

É um landmark `nav` nomeado, sem hover obrigatório. Serviço recebe badge apenas com a contagem real de pedidos prontos já disponível. A contagem tem texto acessível. “Mais” indica destino ativo em overflow e usa `aria-haspopup="dialog"`.

## 5. Topbar mobile

Usa altura mínima de 52 px mais safe area superior. Mostra restaurante, atividade e usuário como contexto global. Idioma e tema ficam no sheet “Mais”. O seletor ocupa espaço flexível; nomes longos podem quebrar e controles mantêm alvo touch. A topbar não repete o `APageHeader`.

## 6. Sheet “Mais”

`ShellMoreSheet.vue` reutiliza `ASheet` em variante bottom. Lista destinos permitidos fora da navegação primária e inclui idioma, tema e ações existentes da conta/logout. Mantém scroll interno, fechamento e gestão de foco do primitivo; a navegação fecha o sheet. O fechamento após mudança de rota leva o foco ao `main`, não ao trigger que está oculto.

## 7. Comportamento tablet

Em 768–1279 px, usa rail de 72 px, mantendo a mesma prioridade e itens permission-driven. Não há modo desktop reduzido nem estado de expansão inventado. Em portrait/landscape, o excesso rola no rail e “Mais” fica preso ao final da lista rolável.

## 8. Rail

Exibe até seis destinos e “Mais” (sete controles no máximo), ícones de 24 px e labels sempre visíveis. A largura utiliza `--rail`. Continua touch-first, com hit areas de pelo menos 48 px.

## 9. Comportamento desktop

Em ≥1280 px, a sidebar expandida usa `--sidebar` (240 px). A topbar permanece enxuta e contém atividade, idioma e tema; restaurante vai para o topo da sidebar. O título da página permanece no conteúdo.

## 10. Sidebar

`ShellNavigation` renderiza grupos Operação, Gestão e Ajustes/rodapé a partir do mesmo modelo. Grupos vazios não aparecem. O usuário fica no rodapé. Sidebar e rail são modos do mesmo renderer, sem listas por breakpoint.

## 11. Recolher e persistir

O botão desktop alterna entre sidebar e rail e persiste `aforo-sidebar-collapsed` em `localStorage`. Falha de armazenamento não impede uso. A troca não navega nem altera seleção. A grade anima em 200 ms com tokens de motion e desliga a transição sob `prefers-reduced-motion`.

## 12. Permissões

As regras são derivadas de `usePermissions` e dos slugs atuais. Serviço mantém `SERVICE_ACCESS_PERMISSIONS`; Cozinha conserva o gate antigo de navegação `update_kitchen_status`; Ajustes conserva o OR existente entre `manage_restaurants` e `manage_organization`. Não são usados nomes de role nem criadas restrições. O backend segue autoridade.

## 13. Estado ativo e subrotas

O matcher central considera `route.name`, nomes correspondentes de `route.matched` e a fronteira de nome pai mais hífen, cobrindo detalhes existentes como `app-day-close-detail`. Não há condicionais de active state espalhadas nos templates.

## 14. Restaurante ativo

O mesmo `RestaurantSwitcher` e `restaurantStore.load()` existentes são usados. No mobile/rail o seletor fica na topbar; na sidebar expandida vai para seu topo. Não há nova persistência nem alteração de seleção.

## 15. Activity e notificações

`ActivityBell`, `ActivityPanel` e `ReadyOrderNotificationStack` continuam sendo os existentes, sem redesenho. O stack e a assinatura de pedidos prontos são montados uma vez fora do slot de rota. No compact, o stack usa o offset medido da navegação; não existe segunda cópia em sidebar/topbar.

## 16. Snackbar

O `ASnackbar` existente consome `--bar-bottom` definido pela geometria real da bottom nav. O CSS usa `max(bar-bottom, safe-area)` para evitar somar duas vezes a safe area já incluída na medida; sem barra, o fallback respeita o inset do dispositivo. Em tablet/desktop o snackbar permanece inferior e centralizado.

## 17. Safe areas

Topbar, bottom nav, rail/sidebar, main, overlays e snackbar consideram insets superior, inferior e laterais quando aplicável. `ResizeObserver` mede a altura real das barras, incluindo label quebrada e safe area, e mantém `--bar-top`/`--bar-bottom`. A variável é restaurada ao desmontar o shell; páginas não recebem padding individual.

## 18. Teclado virtual

O shell reutiliza `useVisualViewport`. Quando o teclado é detectado no compact, a bottom nav sai da tela e `--bar-bottom` passa a zero; o main mantém clearance da safe area. O sheet continua controlado pelo primitivo e seus limites de viewport/scroll. Nenhum segundo detector de viewport foi introduzido.

## 19. Acessibilidade

Há skip link para `main`, landmarks nomeados, labels visíveis, `aria-current`, badge textual e controles touch de 48 px. A mudança de rota move foco ao `main` somente quando o foco não ficou em conteúdo/autofocus da página ou diálogo; navegação pelo “Mais” aguarda a saída modal. Os comportamentos de Escape, focus trap e retorno de foco são os do `ASheet`. Reduced motion é respeitado.

## 20. Breakpoints e validação responsiva

- **375 px:** estrutura compacta por CSS, topbar flexível, bottom nav com labels, gutters/safe areas e conteúdo com espaço inferior medido.
- **768 px:** início do rail de 72 px e remoção da bottom nav.
- **1024 px landscape:** permanece tablet/rail, com lista rolável e “Mais” acessível; não muda para desktop antes de 1280 px.
- **1280 px:** inicia sidebar desktop; pode recolher ao rail.
- **1440 px:** gutter principal sobe para 40 px.
- **Touch:** destinos, botões e seletores são pelo menos 48 px; sidebar rail continua touch-first.
- **Pointer fine:** não há dependência de hover e controles continuam com alvo confortável.
- **Teclado e safe area:** cobertos estruturalmente e por suítes dos primitivos; bottom nav oculta com teclado e offsets vêm de medidas reais.
- **Orientação, zoom 200% e texto longo:** os breakpoints e CSS conservam wrap/scroll e largura mínima zero. A geometria é estrutural, não screenshot: a renderização real do App Shell em browser ainda não pôde ser aceita visualmente.

`node tests/frontend-shell.mjs` verifica resolução/partição, render de navegação, permissões, pai ativo, badge, landmark/ARIA e os contratos CSS dos breakpoints. A suíte responsiva dos primitivos cobre 54 cenários simulados e a geometria de viewport/zoom. Não há prova de screenshot do shell para cada largura enquanto o Chrome do ambiente não inicia.

## 21. Testes adicionados

`tests/frontend-shell.checks.ts` cobre nove destinos, gates de Serviço/Cozinha/Ajustes, ordem e overflow compact/rail/sidebar, grupo vazio por filtragem, rota filha, estado “Mais”, badge real e nav `aria-current`. `tests/frontend-shell.mjs` adiciona contratos responsivos estruturais para 375/768/1024 landscape/1280/1440, safe areas, teclado e offset do snackbar. Os testes do shell somam 29 assertions comportamentais (incluindo os três modos de navegação, locales e persistência) mais as verificações CSS.

## 22. Build e suites

- `npm run build`: passou com flag padrão (shell legado selecionado).
- `VITE_SHELL_V2=true npm run build`: passou com V2 selecionado.
- `node tests/frontend-shell.mjs`: passou (20 checks de componente/dados + contratos CSS).
- `node tests/frontend-primitives.mjs`: passou (93 checks, focus e snackbar).
- `node tests/frontend-primitives-responsive.mjs`: passou (54 cenários estruturais/simulados).
- `node tests/frontend-design-tokens.mjs`: passou (tokens, pares WCAG e utilities compiladas).
- `npm run test:hardening`: passou (115 checks focados; builds de falha segura também passaram).
- `npm run test:security`: passou (54 checks).
- `node tests/frontend-realtime.mjs`: não completou; o runner exige Chrome e o binário encerra por falta de `libnspr4.so`. O teste não teve dependências de sistema instaladas.
- **Lint:** não há script de lint no `package.json`.

## 23. Regressões encontradas e corrigidas

Foi removida a soma duplicada de safe area no padding do `ASnackbar` quando `--bar-bottom` já inclui a barra e o inset. O fallback de medida da topbar corrigiu a leitura de `--spacing: .25rem`, convertendo para pixels em vez de interpretar `.25` como 0,25 px. O foco ao fechar “Mais” depois de navegar agora aguarda o fechamento do sheet. A safe area lateral também foi incluída no main e rail/sidebar.

## 24. Riscos

O shell V2 é opt-in e ainda precisa de inspeção visual real em dispositivo/browser e de um fluxo autenticado completo com troca de restaurante. Nomes de rotas-filhas não aninhados por prefixo hífen podem precisar de matcher explícito futuro. A prioridade única é necessária enquanto permissões não distinguem os perfis operacionais descritos no documento. Não foram adicionados contratos ou permissões.

## 25. Limitações da validação visual

O Chrome controlado pelo runner fecha antes de abrir DevTools porque o ambiente WSL não tem `libnspr4.so`. Screenshots e validação browser real dos cinco tamanhos permanecem pendentes. Foram executadas revisão estrutural de CSS, testes de componente, contratos de viewport, revisão de navegação e dois builds. Nenhuma dependência de sistema foi instalada.

## 26. Dívida para Fase 4

- Validar o shell em browser/dispositivos nos breakpoints e nos três locales, incluindo zoom, safe area e troca de orientação.
- Conectar layout imersivo somente quando uma rota real trouxer metadata/contrato para isso; nesta fase todas as rotas usam chrome normal.
- Confirmar com produto a correspondência final entre perfis operacionais e ordem de destinos quando as permissões atuais permitirem distingui-los.
- Avaliar `LegacyAppShell` para remoção após a validação/rollout do opt-in.
- Não foram migradas páginas nem componentes de domínio nesta fase.

## 27. Decisão sobre feature flag

`VITE_SHELL_V2` foi implementada: é uma chave simples em `appConfig`, false por padrão, sem manter uma segunda arquitetura de estado ou subscrições. O shell legado serve como rollback de apresentação, compartilhando a mesma lista resolvida e integração global. Os dois caminhos passaram pelo build.

## Compatibilidade e escopo

- **Componentes criados:** `AAppShell.vue`, `ShellNavigation.vue`, `ShellTopbar.vue`, `ShellMoreSheet.vue`, `LegacyAppShell.vue` (apresentação de rollback) e `navigation.ts`.
- **Arquivos evoluídos:** `AppShellLayout.vue`, `config/env.ts`, `LanguageSwitcher.vue`, `ThemeSwitcher.vue`, `UserMenu.vue`, `ASnackbar.vue`, `useShellLayout.ts`, `.env.example` e os três arquivos de locale.
- **APIs públicas:** nenhuma API de backend ou contrato de componente existente foi removido/trocado. Switchers/UserMenu receberam props opcionais de apresentação (`inline`, `hideSettings`) para reuso no sheet. A implementação do shell é interna ao layout.
- **Permissões:** nenhuma criada, removida ou alterada; a navegação mantém os gates existentes.
- **Rotas:** nenhuma criada, removida ou renomeada.
- **Páginas de domínio:** nenhuma foi migrada ou teve conteúdo interno alterado.
- **Próxima fase:** o shell está implementado e compilando nos dois modos, pronto para receber a Fase 4. A aprovação visual em browser ainda é uma etapa pendente antes de habilitar V2 em produção.
