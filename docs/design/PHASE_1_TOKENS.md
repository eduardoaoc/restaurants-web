# Fase 1 — tokens SALOA V2 em paralelo

Fonte visual: [SALOA Design System](DESIGN_SYSTEM.md), §3–11, §19, §27 e §30.
O caminho solicitado `DESIGN_SYSTEM_SALOA.md` não existe neste checkout;
`DESIGN_SYSTEM.md` contém o documento SALOA v1.0 e as seções citadas.
`AGENTS.md` está vazio. Nenhum documento de governança foi renomeado.

## Impacto medido antes da edição

- `src/styles/tokens.css`: primitivos de marca, papéis M3 Light/Dark/System,
  status, `--chart-*`, `--shape-corner-*`, fonte de sistema e duas sombras.
- `src/style.css`: integração CSS-first do Tailwind v4 via `@theme`;
  `body` consome background/on-background/font-sans.
- 43 usos de `text-primary`, 145 de `outline-primary`, 5 de `ring-primary`
  e 4 da família `border-primary`; a família `bg-primary` tem 59 ocorrências
  (inclui containers). Não houve substituição desses usos em componentes.
- `rounded-sm/md/lg`: 3/65/118 usos. Redefinir essas classes para 6/10/14
  migraria a geometria de muitos componentes; seus contratos foram preservados.
- Spacing existente: `--spacing: .25rem` do Tailwind, base 4 px com root 16 px.
  Nenhuma segunda escala foi criada e nenhum uso de spacing foi migrado.
- Motion: durações numéricas e curvas padrão do Tailwind, além de transições
  locais com reduced-motion. Z-index: números utilitários e arbitrários.
  Larguras: rail atual de 80 px, detalhes de 380/400/420 e dialogs de 560 px.
  Esses consumidores continuam iguais.
- Build anterior à implementação passou.

## Fundação adicionada

`src/styles/tokens-v2.css`, importado depois do legado:

- 25 papéis `--color-*` com valores exatos das tabelas Light/Dark, incluindo
  superfícies, fills/estados primários, texto/acento, bordas/foco, quatro
  pares de status e scrim.
- `--radius-sm/md/lg/full`: 6/10/14/9999 px.
- `--elevation-flat/raised/floating/modal` com os níveis da §8.
  Flat e raised Dark usam sombra zero transparente, equivalente visual a
  nenhuma sombra e válido na lista de sombras composta do Tailwind.
- `--duration-instant/fast/base/slow`: 100/150/200/300 ms;
  `--ease-out/in/in-out`: curvas exatas da §10.
- `--z-sticky/nav/menu/sheet/dialog/snackbar`: 10/20/30/40/50/60.
- `--pane-detail/sidebar/rail/form-max/dialog-sm/dialog-md`:
  420/240/72/720/400/560 px.
- `--icon-sm/md/lg`: 16/20/24 px. Phosphor continua sendo o sistema atual.
- `prefers-contrast: more`: hairline usa border-strong e texto terciário usa
  texto secundário, tanto em tema forçado quanto em System.

`src/style.css` mantém a arquitetura Tailwind v4, sem configuração paralela:

- Todos os utilitários de cor semântica da §3.2 estão disponíveis, incluindo
  `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-accent`, `ring-accent`,
  `ring-focus`, `border-hairline`, `border-control` e backgrounds/status.
- `shadow-flat/raised/floating/modal` resolvem as variáveis em runtime.
  Uma sombra literal registrada no tema seria embutida pelo compilador e
  não acompanharia a troca para Dark.
- Radius V2 é opt-in com `rounded-saloa-sm/md/lg` ou
  `rounded-(--radius-md)`. `rounded-sm/md/lg` continuam 8/12/16 px via
  `@theme inline` e `--shape-corner-*`. Não usar esses nomes antigos para
  implementar a nova geometria.
- `duration-instant/fast/base/slow`, `ease-saloa-out/in/in-out`;
  as classes antigas `ease-out/in/in-out` preservam as curvas atuais.
- Larguras: `w-pane-detail`, `w-sidebar`, `w-rail`, `max-w-form`,
  `max-w-dialog-sm/md`. Camadas: por exemplo, `z-(--z-dialog)`.
- Nenhuma alteração de fonte, escala tipográfica ou dependências.

## Aliases e P0 de contraste

| Legado | SALOA |
|---|---|
| `--md-sys-color-primary` | `--color-primary` (fill) |
| `--md-sys-color-on-primary` | `--color-on-primary` |
| `--md-sys-color-background` | `--color-background` |
| `--md-sys-color-on-background` | `--color-text-primary` |
| `--md-sys-color-surface` | `--color-surface` |
| `--md-sys-color-on-surface` | `--color-text-primary` |
| `--md-sys-color-on-surface-variant` | `--color-text-secondary` |
| `--md-sys-color-outline` | `--color-border-strong` |
| `--md-sys-color-outline-variant` | `--color-border` |
| `text-primary`, `border-primary`, `ring-primary` | `--color-primary-text` |
| `outline-primary` | `--color-focus-ring` |

O alias de acento é específico da propriedade CSS: `bg-primary` continua
fill, inclusive num elemento que também tenha `text-primary`. Utilitários
funcionais usam lookups privados que resolvem somente o nome `primary` e
preservam variantes e modificadores de opacidade. `&&` dá precedência ao
alias diante da regra nativa de cor do Tailwind, sem `!important`.
Essa especificidade é temporária e deve ser removida com o alias na fase 7.

Texto primário de marca: Light `#A84300` (6,06:1 em surface); Dark `#FF9A4D`
(8,25:1 em surface). Fill: `#FF7300` / `#FF7A1A`. Foco segue exatamente o
documento: `#A84300` / `#FF7A1A` (no Dark difere de primary-text).

Os valores M3 continuam declarados. Secondary/tertiary, escada tonal,
primary-container/on-primary-container, pares de status on-color/container,
sombras antigas e tokens de marca não foram redirecionados: não há
equivalência inequívoca com os novos papéis. `--chart-*` seguem seus aliases
atuais e acompanham os papéis equivalentes atualizados.

**Impacto visual global previsto:** canvas e surface, texto e bordas
equivalentes ficam SALOA; acento/foco ficam acessíveis e o fill primário
Dark muda para o valor documentado. Tipografia, geometria, sombras antigas,
layouts e componentes continuam nos contratos atuais. Isso ainda não é
uma tela integralmente migrada.

## Validação e limites

- `npm run build`: aprovado após a implementação final (vue-tsc + Vite).
- `node tests/frontend-design-tokens.mjs`: 50 valores de cor contra o
  documento, igualdade das duas declarações Dark, 72 pares WCAG e 81
  utilitários compilados. Inclui precedência do P0, opacidades, variantes,
  runtime das sombras e preservação de radius/type/motion legados.
- `npm run test:hardening`: 115 verificações, 18 builds negativos e 2 builds
  seguros HTTPS/WSS aprovados. Reexecutado fora do sandbox após limitações
  de socket/subprocessos do ambiente restrito.
- `npm run test:security`: 54 verificações aprovadas (doubles locais).
- Não existe script lint no `package.json`.
- `agent-browser` foi tentado, inclusive fora do sandbox: Chrome falha com
  `libnspr4.so` ausente. Sem screenshots ou validação visual em runtime;
  não foram instaladas dependências. Build/contraste não substituem essa revisão.

## Riscos e trabalho posterior

1. **Pares legados fora da paleta SALOA:** no Light, primary-text sobre
   `surface-container-high` passa por margem pequena (4,51:1), mas sobre
   `surface-container-highest` dá 4,11:1. Border-strong sobre highest legado
   dá 2,52:1 Light e 2,69:1 Dark. São limites calculados dessas combinações,
   não afirmação de que todos os consumidores atuais as renderizam.
   Os pares definidos na §3 SALOA passam; não adaptar os hex para compensar
   superfícies antigas. Revisar os consumidores ao migrá-los.
2. **Elevação Dark depende do componente:** combinar surface + hairline em
   raised e surface-elevated + hairline em floating; modal requer scrim.
   Tokens de sombra não aplicam fundo, borda ou backdrop automaticamente.
3. **Fase 2:** adotar os raios/motion/superfícies nos primitivos reais,
   evoluir variantes e estados disabled/focus. AButton e AIconButton não
   foram alterados nesta fase.
4. **Acessibilidade de componentes:** reduced-motion contextual, redução de
   transparência/blur, anéis de 2 px, scroll-padding conforme barras,
   semântica/foco/teclado e tamanhos de toque exigem trabalho nos componentes.
   Os tokens não podem corrigir esses comportamentos sozinhos.
5. **Tipografia:** Inter e nova escala permanecem dependentes do gate de
   marca e da migração; preservar o display legado evita mudança global.
6. Shell, Dashboard, KDS, bottom navigation, rotas, stores, autenticação,
   permissões, APIs e lógica funcional não receberam alterações nesta fase.
