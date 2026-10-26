# Design System

> **Status:** v1.0 · proposta oficial · 2026-10-26
> **Escopo:** fonte de verdade para **todas** as decisões visuais e de UX futuras do frontend SALOA (`restaurants-web`).
> **Base:** `docs/design/UI_AUDIT.md` (achados P0–P3) e `docs/design-system.md` (sistema AFORO atual, que será substituído aos poucos). Respeita as regras permanentes do `CLAUDE.md`: i18n, auth, permissões vindas do backend, nada de framework de UI, validação com agent-browser.
> **Princípio central:** **Apple quality, not Apple clone.**

### Leia isto primeiro (para agentes)

1. **SALOA** é a marca definitiva. **AFORO** é o nome legado que ainda está no código, nos assets e nos tokens (`--brand-*`, `aforo-*.png`). **Não renomeie nada** até existir um bloco de migração aprovado (§30, fase 6).
2. Este documento **substitui a direção** do `docs/design-system.md` (Material 3 como linguagem estrutural). Enquanto o `CLAUDE.md` não for atualizado para apontar para cá, valem as duas regras ao mesmo tempo: **regras técnicas** do `CLAUDE.md` (tokens, i18n, a11y, validação) e **direção visual** deste documento. Em conflito visual, este documento vence. A tabela §30.1 lista exatamente o que muda.
3. Os valores de cor deste documento **foram verificados com a fórmula de contraste WCAG**, não estimados. Não troque um hex sem recalcular.
4. Nada aqui autoriza inventar endpoint, campo, permissão ou limiar operacional. Onde um comportamento depende de dado do backend (ex.: limite de SLA da cozinha), isso aparece marcado como **[contrato]**.

---

## Índice

1. [Filosofia de produto](#1-filosofia-de-produto)
2. [Princípios de UX](#2-princípios-de-ux)
3. [Paleta](#3-paleta)
4. [Tipografia](#4-tipografia)
5. [Spacing](#5-spacing)
6. [Radius](#6-radius)
7. [Borders](#7-borders)
8. [Shadows / elevation](#8-shadows--elevation)
9. [Iconografia](#9-iconografia)
10. [Motion](#10-motion)
11. [App Shell](#11-app-shell)
12. [Page Header](#12-page-header--apageheader)
13. [Buttons](#13-buttons)
14. [Inputs](#14-inputs)
15. [Selection controls](#15-selection-controls)
16. [Surfaces](#16-surfaces)
17. [Data tables](#17-data-tables)
18. [Menus](#18-menus--amenu)
19. [Dialogs, sheets, drawers](#19-dialogs-sheets-drawers)
20. [Feedback](#20-feedback)
21. [Estados operacionais](#21-estados-operacionais)
22. [Kitchen Design (KDS)](#22-kitchen-design-kds)
23. [Waiter Design](#23-waiter-design)
24. [Management Design](#24-management-design)
25. [Public QR Design](#25-public-qr-design)
26. [Responsive Design](#26-responsive-design)
27. [Accessibility](#27-accessibility)
28. [NEVER DO THIS](#28-never-do-this)
29. [Component roadmap](#29-component-roadmap)
30. [Migration strategy](#30-migration-strategy)
31. [Revisão do documento](#31-revisão-do-documento)

---

## 1. Filosofia de produto

### Instrumento de operação

O SALOA é uma ferramenta de trabalho usada **durante** o serviço: com pressa, com barulho, com as mãos ocupadas, por horas seguidas. A interface se comporta como um bom instrumento:

- **Calma quando está tudo bem.** Em repouso, a tela é quase monocromática: superfícies neutras, tipografia escura e uma única cor de ação. Nada pisca, nada pede atenção sem motivo.
- **Inequívoca quando algo precisa de alguém.** Atenção é rara, então quando aparece ela se destaca sem esforço. Cor, ícone, texto e peso entram **juntos**.
- **Rápida de verdade.** Feedback no toque, não no fim da requisição. A tela nunca fica em branco ao recarregar.
- **Previsível.** A mesma coisa tem a mesma aparência e o mesmo lugar em todas as telas. O usuário aprende uma vez.

### Apple quality, not Apple clone

Da Apple vêm os **princípios**, não os componentes:

| Pegamos | Não pegamos |
|---|---|
| Hierarquia feita com tipografia (tamanho, peso, entrelinha) | Visual "iOS no navegador" (switches verdes, large titles colapsando, tab bar idêntica) |
| Redução de ruído: cada elemento precisa se justificar | SF Pro / SF Symbols (licença e plataforma) |
| Espaçamento consistente e generoso | Glassmorphism em cards e painéis |
| Controles previsíveis e de tamanho confortável | Raios grandes e "fofos" (28 px+) em controles |
| Feedback imediato (no pointer-down) | Animações com bounce sem gesto que as justifique |
| Progressive disclosure | Esconder funções essenciais em gestos que ninguém descobre |
| Materiais translúcidos **só** como camada flutuante de navegação | Blur como decoração |

Outras referências entram com papel restrito. **Linear:** densidade de gestão e velocidade de teclado. **Stripe:** tabelas e precisão numérica. **Vercel:** neutralidade e contraste. **Raycast:** menus e ações por teclado. **Nenhuma delas é copiada.** A personalidade SALOA vem de três coisas: o laranja usado como sinal, a qualidade dos números e a calma.

### Os oito princípios aplicados ao SALOA

| Princípio Apple | No SALOA significa |
|---|---|
| Purpose | Cada tela responde a uma pergunta operacional ("o que preciso fazer agora?"). Métrica que não muda decisão sai da tela operacional. |
| Agency | "Desfazer" em vez de "tem certeza?". Confirmação só para o irreversível (cancelar pedido pago, anular sessão, fechar o dia). |
| Responsibility | Alérgenos sempre com texto e ícone, nunca só ícone. Valores de dinheiro sempre formatados pelo locale. |
| Familiarity | Mesmo padrão de lista, detalhe, menu e diálogo em todos os módulos. |
| Flexibility | Densidade por papel (§22–25), não por gosto do autor da tela. |
| Simplicity | O caminho comum primeiro, o avançado um nível abaixo (menu "Mais", painel de detalhe). |
| Craft | Todo número com `tabular-nums`, todo alinhamento na grade de 4 px, todo estado desenhado. |
| Delight | Vem de as sete acima funcionarem. Nada de confete. |

---

## 2. Princípios de UX

1. **Agora primeiro.** Cada tela operacional abre mostrando o que exige ação imediata (chamados, pendentes, atrasos) antes de qualquer resumo.
2. **Um toque para o comum.** As ações mais frequentes (avançar comanda, aprovar pedido, abrir mesa, atender chamado) levam no máximo 1 toque a partir da tela principal do papel e 2 a partir de qualquer outra.
3. **Feedback em 100 ms.** Todo toque gera resposta visual imediata (pressed). Toda ação concluída gera confirmação (§20). Toda falha gera explicação e saída.
4. **Otimista quando é seguro.** Ações reversíveis atualizam a UI na hora e oferecem "Desfazer". Se o servidor falhar, a UI volta ao estado anterior com explicação. Ações financeiras ou irreversíveis esperam o servidor.
5. **Nunca tela em branco.** Recarregar em segundo plano mantém o conteúdo e mostra um indicador discreto. Skeleton só no primeiro carregamento.
6. **Progressive disclosure.** Lista → detalhe. Resumo → expandir. Ação comum visível, ação rara no menu "Mais".
7. **Proximidade = relação.** A ação fica junto do objeto que ela afeta (o botão de avançar fica na comanda, não numa barra global).
8. **Nomes específicos.** "Fechar mesa 12", não "Confirmar". "Pedido enviado à cozinha", não "Sucesso".
9. **Wayfinding.** Toda tela responde: onde estou (h1), para onde posso ir (navegação), como volto (voltar ou breadcrumb), o que mudou (feedback).
10. **Forgiveness.** Formulário sujo pede confirmação ao descartar. Ação destrutiva nomeia a consequência. Nunca "Tem certeza?".
11. **Permissão decide visibilidade, o backend decide autorização.** Uma ação não permitida não aparece. Se aparecer e o backend responder 403, mostre uma explicação humana (§20.3).

---

## 3. Paleta

### 3.1 Estratégia

- **Neutros quase acromáticos.** O Light tem um toque mínimo de calor (nunca creme). O Dark é grafite neutro. As superfícies não "têm cor".
- **Uma cor de marca: laranja SALOA.** Por enquanto vem do primitivo legado `--brand-orange-500` `#FF7300`, até a marca SALOA entregar seus assets (§30, fase 6). O laranja é **sinal**: ação primária, seleção ativa, foco, "precisa de você agora".
- **Separar fill de texto (corrige P0-1 da auditoria).** `#FF7300` funciona como **fundo** (com texto escuro, 6,93:1) mas falha como **texto ou traço fino** sobre claro (2,58:1). Por isso existe `primary-text`, a versão do laranja usada para texto, links, ícones e anéis de foco.
- **Status com quatro tons dessaturados** (success, warning, danger, info), cada um com uma versão `-subtle` para fundo. Status **nunca** usa só a cor (§21).
- **Sem gradiente em UI.** `--brand-gradient` e `--brand-glow` ficam restritos a momentos de marca: o logo, uma vez na tela de login e uma vez na entrada do QR.

### 3.2 Papéis semânticos

Nomes canônicos (CSS custom properties). A coluna "Tailwind" mostra o utilitário futuro. `text-primary` **não** é usado como nome de utilitário, para não colidir com a cor de marca.

| Papel | Uso | Tailwind futuro |
|---|---|---|
| `background` | Canvas da aplicação, atrás de tudo | `bg-background` |
| `surface` | Painéis, cards, campos, linhas de tabela | `bg-surface` |
| `surface-subtle` | Áreas rebaixadas: cabeçalho de tabela, hover de linha, trilho de segmented, fundo de campo desabilitado | `bg-surface-subtle` |
| `surface-elevated` | Camada flutuante: menu, popover, dialog, sheet, snackbar | `bg-surface-elevated` |
| `primary` | Fill da ação primária e de indicadores grandes (thumb de switch ligado, badge de contagem) | `bg-primary` |
| `primary-hover` / `primary-active` | Estados do fill primário | `hover:bg-primary-hover` … |
| `on-primary` | Texto e ícone sobre `primary` | `text-on-primary` |
| `primary-text` | Laranja para **texto, link, ícone, anel de foco, indicador de aba**, ou qualquer traço fino | `text-accent`, `ring-accent` |
| `primary-subtle` | Fundo de item selecionado (linha, chip, item de navegação ativo) | `bg-primary-subtle` |
| `text-primary` | Texto principal, títulos, valores | `text-fg` |
| `text-secondary` | Descrições, metadados, labels de coluna | `text-fg-muted` |
| `text-tertiary` | Placeholder, timestamps, texto desabilitado legível | `text-fg-subtle` |
| `border` | Hairline decorativa: separadores, contorno de painel | `border-hairline` |
| `border-strong` | **Limite de controle** (input, checkbox, radio, botão secondary): exige ≥ 3:1 | `border-control` |
| `focus-ring` | Anel de foco | `ring-focus` |
| `success`, `warning`, `danger`, `info` | Texto e ícone de status | `text-success` … |
| `*-subtle` | Fundo de status (badge, alert, linha marcada) | `bg-success-subtle` … |
| `scrim` | Véu atrás de dialog e sheet | `bg-scrim` |

### 3.3 Light

| Papel | Hex | Contraste verificado |
|---|---|---|
| `background` | `#F5F5F3` | — |
| `surface` | `#FFFFFF` | contra background 1,09 (separação vem da hairline, §7) |
| `surface-subtle` | `#EFEFEC` | — |
| `surface-elevated` | `#FFFFFF` + sombra nível 2/3 | — |
| `primary` | `#FF7300` | com on-primary **6,93** |
| `primary-hover` | `#F26B00` | com on-primary 6,18 |
| `primary-active` | `#E06200` | com on-primary 5,32 |
| `on-primary` | `#1A0F00` | — |
| `primary-text` | `#A84300` | surface **6,06** · background 5,55 · subtle 5,26 · primary-subtle 5,47 |
| `primary-subtle` | `#FFF1E5` | — |
| `text-primary` | `#1B1B1A` | surface 17,24 · subtle 14,96 |
| `text-secondary` | `#5C5C58` | surface 6,72 · subtle 5,83 |
| `text-tertiary` | `#6B6B66` | surface 5,36 · background 4,91 · subtle 4,65 |
| `border` | `#E3E3DF` | decorativa (1,29), **nunca** limite de controle |
| `border-strong` | `#85857F` | surface 3,71 · subtle 3,22 · background 3,40 |
| `focus-ring` | `#A84300` (= primary-text) | surface 6,06 |
| `success` / `success-subtle` | `#1E7547` / `#E6F2EA` | texto 5,69 em surface · 4,95 em subtle |
| `warning` / `warning-subtle` | `#8A5700` / `#FBF0DC` | 6,10 · 5,40 |
| `danger` / `danger-subtle` | `#C0261A` / `#FBE9E7` | 5,94 · 5,07 · branco sobre danger 5,94 |
| `info` / `info-subtle` | `#3A5A7A` / `#E8EEF4` | 7,18 · 6,15 |
| `scrim` | `rgba(16,16,15,0.40)` | — |

### 3.4 Dark

O Dark não inverte o Light. A profundidade vem de **superfícies que clareiam conforme sobem**, mais hairlines visíveis. Sombras quase não aparecem no escuro.

| Papel | Hex | Contraste verificado |
|---|---|---|
| `background` | `#111113` | — |
| `surface` | `#1A1A1D` | — |
| `surface-subtle` | `#151517` | (rebaixada: mais escura que surface) |
| `surface-elevated` | `#242428` | contra surface 1,12 + hairline |
| `primary` | `#FF7A1A` | com on-primary **7,24** · contra surface 6,66 |
| `primary-hover` | `#FF8A33` | 8,03 |
| `primary-active` | `#F06A00` | 6,08 |
| `on-primary` | `#1A0F00` | — |
| `primary-text` | `#FF9A4D` | surface **8,25** · elevated 7,35 · primary-subtle 7,95 |
| `primary-subtle` | `#2B1A0C` | — |
| `text-primary` | `#F2F2F0` | surface 15,49 · elevated 13,80 |
| `text-secondary` | `#A6A6A2` | surface 7,11 · elevated 6,33 |
| `text-tertiary` | `#8E8E92` | surface 5,32 · elevated 4,74 |
| `border` | `#2C2C31` | decorativa (1,25) |
| `border-strong` | `#747479` | surface 3,73 · elevated 3,33 · subtle 3,92 |
| `focus-ring` | `#FF7A1A` | elevated 5,93 |
| `success` / `success-subtle` | `#5CC98E` / `#13281C` | 8,43 · 7,57 |
| `warning` / `warning-subtle` | `#E6B04A` / `#2B2210` | 8,83 · 7,97 |
| `danger` / `danger-subtle` | `#FF7A6E` / `#2E1614` | 6,83 · 6,66 · on-primary sobre danger 7,43 |
| `info` / `info-subtle` | `#8FB4D9` / `#152230` | 8,02 · 7,44 |
| `scrim` | `rgba(0,0,0,0.56)` | — |

### 3.5 Regras de uso

- **Laranja por tela (orçamento):** no máximo **1 botão primary** por região de trabalho, mais a seleção ativa e os itens em `attention`. Se a tela tem cinco coisas laranja, quatro estão erradas.
- **`primary` (fill) nunca como texto, ícone ou borda** sobre superfície clara. Para isso use `primary-text`.
- **Texto sobre fundo de status:** use o próprio tom de status (`danger` sobre `danger-subtle`) ou `text-primary`, nunca `text-tertiary`.
- **Info é neutro-azulado e raro.** Serve só para mensagens informativas do sistema (§20.2), nunca para estado operacional nem como acento de marca. Isso respeita a regra do `CLAUDE.md` de não usar azul como cor de marca.
- **Gráficos:** padrão de ênfase (uma série em `primary`, o resto em neutros), sempre com legenda e rótulos diretos. Carregue a skill `dataviz` antes de escrever gráfico (regra do `CLAUDE.md` §17).
- **Tema:** `system` por padrão, `data-theme` força o modo, a preferência fica no `localStorage` (arquitetura atual mantida). A transição de tema não anima cores de página inteira.
- **`prefers-contrast: more`:** `border` passa a valer `border-strong`, `text-tertiary` passa a valer `text-secondary`, e o blur da navegação vira sólido.

---

## 4. Tipografia

### 4.1 Família

**Recomendada: Inter (variable, v4), com hospedagem própria, e fallback `system-ui`.**

```
--font-sans: "Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-features: "cv11", "ss01";   /* a de um andar e dígitos legíveis — validar no protótipo */
```

Por que Inter e não a fonte do sistema:

- **Consistência entre dispositivos.** O stack de sistema muda de forma entre iPad (SF), Android (Roboto) e Windows (Segoe), e uma comanda precisa ter a mesma largura em todos.
- **Algarismos tabulares de verdade** (`tnum`) e zero com distinção. Tempo e dinheiro são o conteúdo principal do produto.
- **Eixo óptico (`opsz`)** na v4: o display fica mais fechado e o texto pequeno mais aberto, que é a disciplina tipográfica da Apple.
- **Licença OFL, variável, um arquivo (~100 KB woff2 com subset latino).**

> **Inter é a escolha segura, não a distintiva** (a revisão com frontend-design apontou isso, porque é a família padrão de quase todo SaaS). Ela fica com a **UI** porque legibilidade e `tnum` vêm antes de personalidade num instrumento. A **personalidade tipográfica** do SALOA fica para o `text-display` e o `text-page-title`. No protótipo da fase 4a, compare três candidatas para esses dois papéis: **Inter Display** (coerência total), **Geist** (mais geométrica e técnica) e **Instrument Sans** (mais calorosa e editorial). Critério: o display combina com o wordmark SALOA e mantém os algarismos tabulares. O corpo continua Inter em qualquer cenário.
>
> **Gate (`CLAUDE.md` §6):** antes de instalar, compare com o wordmark SALOA quando ele existir. Se a marca já trouxer uma fonte, ela vence para display e o Inter fica para a UI. A instalação é um bloco à parte, aprovado. Até lá, o stack de sistema atual continua valendo.

### 4.2 Escala

Os tamanhos estão em rem, base 16 px. O tracking varia por tamanho (fecha no grande, abre no pequeno). A **hierarquia vem de peso e tamanho juntos**, nunca só do tamanho.

| Papel | Token | Tamanho / entrelinha | Peso | Tracking | Uso |
|---|---|---|---|---|---|
| Display | `text-display` | 34 / 40 | 600 | -0,022em | Número herói único (total do dia na gestão), título de boas-vindas do QR |
| Page title | `text-page-title` | 28 / 34 (mobile 24 / 30) | 600 | -0,020em | `h1` de `APageHeader`, um por página |
| Section title | `text-section-title` | 20 / 26 | 600 | -0,012em | `h2` de seção, título de dialog e de sheet |
| Component title | `text-component-title` | 16 / 22 | 600 | -0,006em | Título de comanda, mesa, linha principal, painel |
| Body | `text-body` | 15 / 22 | 400 | -0,003em | Texto padrão, conteúdo de lista e de formulário |
| Body strong | `text-body` + `font-medium` | 15 / 22 | 500 | -0,003em | Valor principal numa linha |
| Body small | `text-body-sm` | 14 / 20 | 400 | 0 | Células de tabela densa, texto secundário |
| Label | `text-label` | 13 / 18 | 500 | 0 | Label de campo, botão sm, cabeçalho de coluna, chip |
| Caption | `text-caption` | 12 / 16 | 400 | +0,01em | Metadado, timestamp, helper. **Piso absoluto: nada abaixo de 12 px.** |
| Metric | `text-metric` | 28 / 32 | 600 | -0,02em | Número de KPI (strip de métricas) · `tabular-nums` |
| Metric small | `text-metric-sm` | 20 / 24 | 600 | -0,01em | Total da mesa, contagem em cabeçalho · `tabular-nums` |
| Timer (KDS) | `text-timer` | 28 / 32 | 700 | -0,01em | Tempo da comanda · `tabular-nums` |

Os botões usam **Body 15/500** (md e lg) ou **Label 13/500** (sm).

### 4.3 Regras

- **`tabular-nums` obrigatório** em todo número operacional: dinheiro, tempo, contagem, quantidade, número de mesa ou de pedido, percentual. Em colunas, números ficam alinhados à direita.
- **Número maior e mais pesado que o rótulo.** O rótulo vai em `caption`/`label` com `text-secondary` e o valor em `metric` com `text-primary`.
- **Um `h1` por página**, sempre dentro de `APageHeader`. A ordem de headings não pula níveis.
- **Separador "·"** só em linhas de metadado densas e com **no máximo 2 separadores** ("Mesa 12 · 4 pax"). Três ou mais informações viram layout (colunas, linhas, badge), não uma string pontuada. "→" não é anexado ao texto de botões nem de links.
- **Sem MAIÚSCULAS** em labels e cabeçalhos (sentence case). Exceção: siglas.
- **Comprimento de linha:** 45–75 caracteres em texto corrido (`max-w-prose`). Descrições de página com no máximo 2 linhas.
- **Pesos permitidos:** 400, 500, 600, 700. O 700 é só para `timer` e para a quantidade em comanda.
- **Dinheiro e datas** sempre por `Intl` com o locale ativo e o fuso do restaurante (regra existente).
- **Escala com o texto do usuário:** spacing de controles em rem, então um zoom de 200% não quebra o layout.

---

## 5. Spacing

### 5.1 Escala (base 4 px)

| Token | px | Tailwind |
|---|---|---|
| `space-1` | 4 | `1` |
| `space-2` | 8 | `2` |
| `space-3` | 12 | `3` |
| `space-4` | 16 | `4` |
| `space-5` | 20 | `5` |
| `space-6` | 24 | `6` |
| `space-8` | 32 | `8` |
| `space-10` | 40 | `10` |
| `space-12` | 48 | `12` |
| `space-16` | 64 | `16` |

**Só esses valores.** `space-7`, `space-9` e `space-14` não existem. Nada de `py-1.5` em controles: altura de controle é token (§13), não padding.

### 5.2 Papéis

| Papel | Valor | Exemplo |
|---|---|---|
| Interno, controle | 12–16 horizontal | Botão md: `px-4` |
| Interno, linha de lista | 12 vertical / 16 horizontal | `AListRow` |
| Interno, painel/card | 16 (compact) · 20 (medium) · 24 (expanded) | Comanda: 16; painel de gestão: 24 |
| Entre elementos relacionados | 4–8 | Label ↔ campo: 6 → **8**; título ↔ descrição: 4 |
| Entre componentes | 12 (compact) · 16 (medium/expanded) | Campos de formulário, cards de uma grade |
| Entre grupos dentro de uma seção | 24 | Fieldsets |
| Entre seções | 32 (compact) · 40 (expanded) | `h2` ↔ `h2` |
| Header da página ↔ conteúdo | 24 (compact) · 32 (expanded) | — |

### 5.3 Gutters e larguras

| Classe | Viewport | Gutter lateral | Largura máx. de conteúdo |
|---|---|---|---|
| Compact | < 768 | 16 | 100% |
| Medium | 768–1279 | 24 | 100% |
| Expanded | ≥ 1280 | 32 (40 em ≥ 1440) | 1280 (gestão) · formulários 720 · KDS sem limite |

**Larguras de layout (tokens, corrigem P2-10):** `--pane-detail: 420px` · `--sidebar: 240px` · `--rail: 72px` · `--form-max: 720px` · `--dialog-sm: 400px` · `--dialog-md: 560px`.

**Densidade por papel:** use os valores *compact* de espaçamento entre componentes também em KDS e em tabelas densas, mesmo com viewport grande.

---

## 6. Radius

Três níveis e o círculo. Nada de pílula em botão de texto.

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 6 px | Checkbox, badge, chip, item dentro de menu, segmented thumb, tooltip |
| `radius-md` | 10 px | Botão, input, select, card (comanda, mesa, produto), menu, snackbar |
| `radius-lg` | 14 px | Painel, dialog, popover grande, sheet (cantos superiores no mobile, todos no side sheet), imagem de produto no QR |
| `radius-full` | 9999 | Avatar, dot de status, switch, botão só-ícone circular de navegação/fechar |

Regras:

- **Aninhamento:** o raio interno é igual ao raio externo menos o padding (um card md com padding 4 leva um item interno sm), para os cantos ficarem concêntricos.
- **Botão só-ícone** usa `radius-md` (fica alinhado aos botões de texto vizinhos). `radius-full` só para fechar, voltar e avatar.
- Os valores atuais `rounded-xl` (28 px), `rounded-2xl` e `rounded` saem (§30).

---

## 7. Borders

A borda **delimita**, não decora. A pergunta antes de colocar uma: *sem ela, o usuário confundiria o limite?*

| Usar | Não usar |
|---|---|
| `border-strong` em **controles** (input, select, checkbox, radio, botão secondary): é limite de UI e exige 3:1 | Em card que já tem sombra |
| `border` (hairline) para **separar linhas** de lista e tabela | Em volta de cada seção de página |
| `border` no **contorno de painel** (surface sobre background, porque a diferença tonal é pequena de propósito) | Em card dentro de painel: use espaço ou divisória |
| `border` no topo e na base de barras fixas, **só quando há conteúdo rolando por baixo** | Borda lateral colorida para indicar status (side stripe) |
| `border` em `surface-elevated` no Dark (a sombra não aparece) | Borda + sombra + tom diferente no mesmo elemento |
| Contorno de 2 px `focus-ring` (foco) | Borda tracejada como "placeholder vazio" |

- **Espessura:** sempre 1 px. A exceção é o anel de foco (2 px, offset 2).
- **Divisórias de lista:** com inset à esquerda alinhado ao texto (padrão Apple), sem atravessar ícones nem avatares.
- **Seleção** nunca é só borda colorida: usa `primary-subtle`, ícone de check e o atributo ARIA correspondente.

---

## 8. Shadows / elevation

Quatro níveis. **No Dark, a elevação é tonal** (superfície mais clara mais hairline), e a sombra fica apenas residual.

| Nível | Nome | Light | Dark | Quem usa |
|---|---|---|---|---|
| 0 | Flat | nenhuma | nenhuma | Página, painel, seção, linha de tabela: **o padrão** |
| 1 | Raised | `0 1px 2px rgb(0 0 0 / .05), 0 1px 1px rgb(0 0 0 / .03)` | `surface` + hairline | **Objetos tocáveis**: comanda, tile de mesa, card de produto |
| 2 | Floating | `0 8px 24px rgb(0 0 0 / .10), 0 0 0 1px rgb(0 0 0 / .04)` | `surface-elevated` + `0 8px 24px rgb(0 0 0 / .40)` + hairline | Menu, popover, tooltip, snackbar, item sendo arrastado |
| 3 | Modal | `0 24px 48px rgb(0 0 0 / .16)` + scrim | `surface-elevated` + `0 24px 48px rgb(0 0 0 / .50)` + scrim | Dialog, sheet, drawer de navegação |

**Quando algo deve flutuar:** só quando está **por cima de outro conteúdo** e é **temporário** (menu, dialog, sheet, snackbar), ou quando o usuário está **movendo** o objeto (drag). Um card em repouso numa grade não flutua; no máximo é *raised*, se for tocável.

**Materiais (translucência):** permitidos em **um único lugar**, as barras fixas de navegação (bottom nav no mobile e top bar quando há conteúdo rolando por baixo): `surface` a 82% + `backdrop-filter: blur(20px) saturate(160%)`. Com `prefers-reduced-transparency: reduce` ou `prefers-contrast: more`, viram sólidas. **Nunca** em card, painel, dialog ou sheet.

---

## 9. Iconografia

**Sistema: Phosphor** (`@phosphor-icons/vue`, já instalado).

### Tamanhos oficiais: 16 / 20 / 24 (validados)

| Tamanho | Acompanha | Uso |
|---|---|---|
| **16** | Texto 12–14 px | Inline em caption/label, badge, célula de tabela, chip |
| **20** | Texto 15–16 px | **Padrão de controle**: botões, inputs, itens de menu, sidebar, linhas de lista |
| **24** | Títulos e touch | Bottom nav, ícone de status em comanda/tile, empty state, botões lg (KDS e QR) |

Validação: a proporção ícone/texto fica entre ~1,1× e 1,4× nos três casos, e 20 é o meio confortável para a altura de 44 px. Os tamanhos 10, 12, 14, 18, 22 e 26 usados hoje **saem**. **Não há 32.** Empty state usa 24, porque o ícone ali informa, não ilustra.

### Peso

- `regular`: padrão.
- `fill`: **só** para estado selecionado (item ativo da navegação) e ícones de status em comanda/tile, onde o peso ajuda o reconhecimento a distância.
- `bold`: só em KDS, quando o ícone acompanha `timer`.
- `duotone`, `thin` e `light`: não usar.

### Regras

- Todo ícone tem uma função: **identificar** (navegação), **sinalizar** (status) ou **agir** (botão). Ícone ao lado de título de seção "para enfeitar" é proibido (§28).
- Ícone sozinho como botão exige `aria-label`. Ícone ao lado de texto leva `aria-hidden="true"`.
- Cor do ícone: `text-secondary` em repouso, `text-primary` em hover e ativo, o tom de status em status. Nunca `primary` (fill) como cor de ícone sobre claro.
- Um ícone por significado em todo o app (tabela em §21.3), ex.: `PhBellRinging` sempre significa "chamado".

---

## 10. Motion

> Motion **confirma uma mudança de estado** ou **mostra de onde algo veio e para onde vai**. Se não faz nenhuma das duas, não existe.

### 10.1 Tokens

| Token | Valor | Uso |
|---|---|---|
| `--duration-instant` | 100 ms | Press (pointer-down), troca de cor de controle |
| `--duration-fast` | 150 ms | Hover, foco, cross-fade de status, saída de menu |
| `--duration-base` | 200 ms | Entrada de menu/popover, segmented thumb, expand/collapse, reorder |
| `--duration-slow` | 300 ms | Entrada de sheet, dialog e drawer |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | **Entradas** (desacelera ao chegar) |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | **Saídas** (acelera ao sair) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movimento de algo que já está na tela (reorder, thumb) |

**Saída = cerca de 70% da entrada** (sheet entra em 300 ms e sai em 200 ms). Animam só `transform` e `opacity`.

### 10.2 Padrões

| Situação | Comportamento |
|---|---|
| **Press** | `scale(0.98)` + tom pressed em 100 ms no **pointer-down**. Solta em 150 ms. |
| **Hover** | Só cor de fundo/texto, 150 ms. Nunca escala, nunca sombra crescendo. Só com `@media (hover: hover)`. |
| **Entrada genérica** | opacity 0→1 + translateY 4px→0, 200 ms, ease-out. |
| **Saída genérica** | opacity 1→0, 150 ms, ease-in (sem deslocamento). |
| **Mudança de estado** (toggle, check, selected) | Cross-fade de cor/ícone, 150 ms. |
| **Menu / popover** | Nasce do trigger (`transform-origin` no trigger): scale 0.97→1 + opacity, 200 ms. Sai em 150 ms só com opacity. |
| **Dialog** | Scrim com opacity 200 ms. Painel com scale 0.98→1 + opacity, 200 ms ease-out. Sai em 150 ms. |
| **Sheet (bottom)** | translateY 100%→0, 300 ms ease-out. **Sai pelo mesmo caminho** em 200 ms ease-in. Arrastar para fechar segue o dedo 1:1 e, ao soltar, decide pela **velocidade**. Se houver biblioteca de spring: damping 1.0, response 0.3. |
| **Side sheet / drawer** | translateX a partir da borda de onde vem, 300/200 ms, mesmo caminho na saída. |
| **Snackbar** | Sobe 8 px + opacity, 200 ms. Sai com opacity, 150 ms. Uma de cada vez. |
| **Mudança de status operacional** | Cross-fade de cor e ícone em 150 ms, mais **um destaque único** (`primary-subtle`/`*-subtle` que some em 600 ms) no item que mudou. **Nunca em loop.** |
| **Item entrando numa lista** (nova comanda, novo chamado) | Altura 0→auto e opacity, 200 ms, mais o destaque único. A lista nunca "pula". |
| **Reorder / troca de coluna** (KDS) | FLIP com 200 ms ease-in-out. |
| **Count-up de número** | Não fazer em telas operacionais. Permitido só no primeiro paint de métricas de gestão, até 400 ms. |
| **Skeleton** | Pulso de opacity 1→0,6 a cada 1,5 s. Aparece só depois de **300 ms** de espera, para não piscar. |

### 10.3 Interrupção e redução

- Toda animação é **interrompível**: uma nova interação parte do valor atual na tela, e nada bloqueia input durante uma transição.
- **`prefers-reduced-motion: reduce`:** deslocamentos, escalas e FLIP viram **cross-fade de 150 ms**. O destaque único de mudança de status continua (é informação), mas sem movimento. O pulso do skeleton para (fica estático).
- **Proibido:** bounce sem gesto de arremesso, loop infinito chamando atenção (pulse, bounce, shake contínuo), parallax, animação de entrada em página inteira, spinner como decoração.

---

## 11. App Shell

### 11.1 Classes de tamanho

| Classe | Largura | Navegação |
|---|---|---|
| **Compact** | < 768 | Top bar + **bottom navigation** |
| **Medium** | 768–1279 | **Rail** de 72 px (ícone 24 + label caption) + top bar |
| **Expanded** | ≥ 1280 | **Sidebar** de 240 px (recolhível para o rail) + top bar enxuta |

### 11.2 Expanded (desktop)

- **Sidebar** em `background`, sem borda pesada (só uma hairline à direita).
- **Topo da sidebar:** symbol da marca e **seletor de restaurante** (o contexto mais importante, sempre visível).
- **Grupos com rótulo caption:**
  - **Operação:** Painel, Serviço, Cozinha, Sala.
  - **Gestão:** Carta, Mesas, Equipe, Fechamento, Avaliações.
  - **Rodapé:** Ajustes, usuário.
  - Itens filtrados por permissão; um grupo vazio some.
- **Item ativo:** fundo `primary-subtle`, ícone `fill` e texto `text-primary` com peso 600. Nunca só cor.
- **Top bar (56 px):**
  - à direita: atividade, idioma, tema, usuário;
  - à esquerda: breadcrumbs só quando a página é de nível 2+;
  - **não repete o título da página** (corrige P1-7).
- **Recolher:** a sidebar vira rail por preferência do usuário (persistida no `localStorage`).

### 11.3 Medium (tablet)

- Rail de 72 px com os mesmos itens (máximo de 7 visíveis, o resto em "Mais").
- **Modo imersivo (KDS):** a rota da cozinha esconde o rail e a top bar. Fica uma barra compacta de 48 px com restaurante, conexão, relógio e um botão "Sair do modo cozinha".

### 11.4 Compact (mobile) e bottom navigation

- **Top bar (52 px + safe-area):** título da página (component-title), seletor de restaurante como subtítulo tocável e ações globais (atividade, usuário). Translúcida quando há conteúdo rolando por baixo (§8).
- **Bottom navigation (56 px + `env(safe-area-inset-bottom)`):**
  - **No máximo 4 destinos mais "Mais"**, escolhidos por permissão e ordenados pelo papel.

    | Papel (por permissões) | Bottom nav |
    |---|---|
    | Garçom | **Sala** · **Serviço** · Cozinha (se `update_kitchen_status`) · **Mais** |
    | Caixa | **Serviço** · **Fechamento** · **Mais** |
    | Gerente no celular | **Painel** · **Serviço** · **Sala** · **Mais** |

  - Ícone 24 com label caption **sempre visíveis**. O ativo usa ícone `fill`, label 600 e um indicador `primary-subtle` atrás do ícone.
  - Badge de contagem (chamados, pendentes) em `primary` com `on-primary` e texto "3 chamados" para leitores de tela.
  - **"Mais"** abre um `ASheet` com os demais destinos, idioma, tema e logout.
  - Some quando o teclado está aberto e dentro de sheets em tela cheia.
- O drawer hambúrguer **deixa de existir** como navegação principal.

### 11.5 Regras gerais

- **Ajustes** fica na navegação (rodapé da sidebar/rail ou "Mais"), não só no menu do usuário.
- **A ordem dos itens é a mesma** em todas as classes de tamanho.
- O skip link continua, e o `main` recebe `id` e o foco ao trocar de rota.
- Notificações globais (pedido pronto) usam `ASnackbar` com ação "Ver", empilhadas acima da bottom nav.

---

## 12. Page Header — `APageHeader`

Um componente, todas as páginas autenticadas. Ele resolve o título duplicado, os headings inconsistentes e as ações espalhadas.

### Anatomia

```
[breadcrumbs]                                         (opcional, nível 2+)
[← voltar]  H1 Título da página        [context]      [secondary] [secondary] [PRIMARY]
            Descrição opcional, até 2 linhas, text-secondary
```

| Parte | Regra |
|---|---|
| `title` | **h1**, `text-page-title`. Obrigatório. Nome específico ("Mesa 12", "Cozinha"). |
| `description` | Opcional, `text-body text-secondary`, até 2 linhas. **Omitir** quando o título já basta. Telas operacionais (KDS, Serviço) não têm descrição. |
| `breadcrumbs` | Só em páginas de nível 2+ (detalhe de fechamento, produto). Último item sem link, `aria-current="page"`. Em compact viram só "← Voltar". |
| `back` | Em compact, para nível 2+. Volta para a lista com filtros preservados. |
| `context` | Até 2 itens de status da página: conexão em tempo real, data operacional, "Atualizando…". Usa `AStatusBadge`, texto pequeno. |
| `actions` | No máximo **1 primary e 2 secondary/ghost** visíveis. O resto vai num `AMenu` "Mais" (ícone de reticências). Em compact, a primary vira botão full-width abaixo do título, ou um botão na top bar se for curta. |

### Comportamento

- **Não é sticky** por padrão. Em listas longas de gestão, uma toolbar (busca e filtros) pode ser sticky, mas o header não.
- **Espaçamento:** 24/32 até o conteúdo (§5.2).
- **Conteúdo carregando:** o header renderiza na hora (o título é conhecido) e só o conteúdo mostra skeleton.
- **Sem acesso (403):** o header renderiza e o conteúdo vira `AErrorState kind="forbidden"`.

---

## 13. Buttons

### 13.1 Variantes (quatro, e só quatro)

| Variante | Visual | Quando |
|---|---|---|
| **primary** | Fill `primary`, texto `on-primary` | A ação principal da região. **Uma por região.** |
| **secondary** | Fill `surface`, borda `border-strong`, texto `text-primary` | Ações alternativas ("Cancelar", "Ver detalhes", "Exportar") |
| **ghost** | Sem fill e sem borda, texto `text-primary` (ou `primary-text` quando é link de navegação). Hover com `surface-subtle`. | Ações terciárias, toolbars, ações de linha |
| **danger** | Fill `danger`, texto branco (Light) ou `on-primary` (Dark) | Ação destrutiva **confirmada** (o botão final do dialog de confirmação). Antes da confirmação, use secondary com texto `danger`. |

Não existem "tonal", "outlined" nem "text" separados: o `tonal` e o `outlined` atuais viram **secondary**, e o `text` vira **ghost**.

### 13.2 Tamanhos

| Tamanho | Altura | Padding H | Texto | Ícone | Quando |
|---|---|---|---|---|---|
| `sm` | 32 (alvo de 44 via área de toque invisível) | 12 | Label 13/500 | 16 | **Só `pointer: fine`**: toolbars e linhas de tabela no desktop |
| `md` | **44** | 16 | Body 15/500 | 20 | **Padrão em tudo** |
| `lg` | 52 (56 no contexto `kds`) | 20 | Body 15/600 (17/600 no KDS) | 24 | Ação principal do KDS, CTA do QR, ação primária de sheet no mobile |

`AIconButton` tem os mesmos tamanhos, quadrado, com `radius-md`, e `aria-label` obrigatório.

### 13.3 Estados

| Estado | Tratamento |
|---|---|
| Hover | primary → `primary-hover`; secondary/ghost → `surface-subtle` (150 ms) |
| Pressed | `primary-active` / `surface-subtle` mais escuro, `scale(.98)`, no pointer-down (100 ms) |
| Focus | Anel de 2 px `focus-ring`, offset 2, **só `:focus-visible`** |
| Loading | Spinner 16/20 no lugar do ícone leading, **largura preservada**, `aria-busy`, label mantida ("Guardando…" opcional) |
| Disabled | Fill `surface-subtle`, texto `text-tertiary`, sem sombra. **Não usar opacity .38 sobre laranja** (vira bege ilegível). Sempre com explicação próxima quando o motivo não é óbvio. |

### 13.4 Regras

- Rótulo é **verbo + objeto** ("Fechar mesa", "Enviar à cozinha"), nunca "OK" ou "Sim".
- Ordem num grupo: secondary à esquerda e primary à direita (desktop). No mobile, primary embaixo em full-width, mais perto do polegar.
- Link com aparência de botão é `AButton as="RouterLink"`. Nada de `RouterLink` estilizado à mão (P2-9).
- Espaço mínimo de 8 px entre botões vizinhos.

---

## 14. Inputs

### 14.1 Anatomia comum

```
Label (Label 13/500 text-primary)            [opcional: "Opcional" caption text-tertiary]
┌──────────────────────────────────────────┐
│ [ícone 20]  Valor (Body 15)  [ação 20]   │  44 px · radius-md · border-strong · bg surface
└──────────────────────────────────────────┘
Helper (Caption 12 text-secondary)   ← ou →   [ícone] Erro (Caption 12/500 danger)
```

| Estado | Visual |
|---|---|
| Repouso | `bg surface`, `border-strong` 1 px |
| Hover | Borda `text-secondary` |
| **Focus** | Borda `focus-ring` + anel de 2 px `focus-ring` a 25% de opacidade (sem offset). Visível nos dois temas. |
| **Erro** | Borda `danger`, ícone `PhWarningCircle` 16 mais a mensagem em `danger`. A mensagem **substitui** o helper. `aria-invalid="true"` e `aria-describedby`. |
| **Disabled** | `bg surface-subtle`, texto `text-tertiary`, borda `border`. Label continua legível. |
| Read-only | Sem borda, `bg surface-subtle`, texto `text-primary` (selecionável) |

**Regras comuns:**

- Label **sempre visível**, nunca só placeholder. Placeholder é exemplo, não instrução.
- Marque o **opcional**, não o obrigatório (a maioria dos campos é obrigatória). O asterisco vermelho atual sai.
- Validação **inline ao sair do campo** (blur) e de novo ao enviar. O erro do servidor (422) cai no campo correspondente. O erro geral vai num `AAlert` no topo do formulário, com foco movido até ele.
- Teclado certo no mobile (`inputmode`, `autocomplete`, `enterkeyhint`).
- Fonte de **pelo menos 16 px** no campo em mobile (evita zoom no iOS). O Body 15 sobe para 16 em compact.

### 14.2 Tipos

| Componente | Especificação |
|---|---|
| **`ATextField`** | Como acima. Slots leading/trailing (ícone 20, botão limpar, mostrar senha). Sufixo de unidade ("€", "min") em `text-secondary`. |
| **`ATextarea`** | Mínimo de 3 linhas, cresce até 8 e depois rola. Contador `caption` quando há limite. |
| **`ASelect`** | **`<select>` nativo estilizado** (acessibilidade e picker nativo no mobile de graça), com chevron 16. Busca ou mais de 15 opções: `ACombobox` (P2). |
| **`ACheckbox`** | Caixa de 20 px, `radius-sm`, borda `border-strong`. Marcado: fill `primary` + check `on-primary`. Indeterminado: traço. Toda a linha (caixa + label) é a área de toque de 44 px. Para escolhas que **dependem de "Salvar"**. |
| **`ARadio`** | Círculo de 20 px. Marcado: anel `primary` com miolo. Em `fieldset` com `legend`. Setas navegam (nativo). Para 2–5 opções exclusivas com descrição. Se as opções são curtas, prefira `ASegmented`. |
| **`ASwitch`** | Trilho 40×24, thumb 20, `radius-full`. Ligado: trilho `primary`. Desligado: trilho `border-strong`. Área de toque de 44. **O efeito é imediato** (salva na hora, com snackbar de confirmação ou erro). **Nunca dentro de um formulário com botão Salvar**: ali use `ACheckbox`. Corrige o padrão atual de Ajustes. |
| **`AStepper`** (quantidade) | `−` [valor] `+`, botões de 44 e valor em `metric-sm tabular-nums`. Para quantidade e número de pessoas. Mínimo e máximo desabilitam o botão correspondente. |

---

## 15. Selection controls

| | **ATabs** | **ASegmented** | **AFilterChip** |
|---|---|---|---|
| **O que faz** | Troca **seções de conteúdo** diferentes dentro de uma página | Troca **modo ou visão** do mesmo conteúdo | **Filtra** uma lista |
| **Quantidade** | 2–7 | 2–4, rótulos curtos (1–2 palavras) | Ilimitado (rolagem horizontal no mobile) |
| **Seleção** | Uma | Uma | Uma ou várias, conforme o grupo |
| **Exemplos** | Carta: Categorias / Produtos / Modificadores / Prévia · Fechamento: Hoje / Histórico | Painel: Operação / Análise · Período: Hoje / 7 dias / 30 dias · Mapa / Lista | Equipe: Ativos / Convidados · Garçom / Cozinha · Serviço: "Só minhas mesas" |
| **Visual** | Texto Label 13/500 (`text-secondary` → `text-primary` 600 no ativo) + **indicador inferior de 2 px `primary-text`** sobre hairline | Trilho `surface-subtle` `radius-md` padding 2; **thumb** `surface` raised com `radius-sm`; texto ativo `text-primary` 600 | Altura 32 (fine) / 36 com alvo de 44; `radius-sm`; repouso: borda `border-strong`; **selecionado: `primary-subtle` + ícone check 16 + texto 600** |
| **Altura** | 44 | 36 (fine) / 44 (touch) | 32–36 visível, alvo de 44 |
| **ARIA** | `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls` | `radiogroup` + `radio` (ou `tablist` se trocar painel) | `button` + `aria-pressed` (single e multi) |
| **Teclado** | **Setas** movem e ativam, Home/End, tabindex rotativo (um tab stop) | Setas | Tab entre chips, Space/Enter alterna |
| **URL** | A aba ativa fica na query (`?tab=`) | Pode ir para a query quando muda dados | Filtros na query em telas de gestão |
| **Motion** | Indicador desliza 200 ms ease-in-out | Thumb desliza 200 ms ease-in-out | Cross-fade de 150 ms |

Regras:

- **Abas nunca filtram status operacional.** O KDS atual (uma aba por status) é exatamente o anti-padrão: status vira **coluna** (§22).
- Um chip pode mostrar uma contagem (`Pendentes · 3`), em `tabular-nums`.
- Com 1+ filtros ativos, aparece um "Limpar filtros" (ghost) no fim da fileira.
- Um grupo de chips sempre tem `aria-label` ("Filtrar por estado").

---

## 16. Surfaces

### 16.1 Quatro tipos

| Tipo | O que é | Visual | Exemplo |
|---|---|---|---|
| **Section** | Agrupamento lógico **sem caixa** | `h2` section-title + conteúdo direto sobre `background`, separado por 32/40 de espaço (hairline opcional) | Ajustes: "Restaurante", "Pedidos", "Idiomas" |
| **Panel** | **Uma região de trabalho** contínua | `surface`, hairline `border`, `radius-lg`, **elevação 0**, padding 16/20/24 | Lista de equipe, painel de detalhe, coluna do KDS, strip de métricas |
| **Card** | **Um objeto** independente e acionável, repetido em grade | `surface`, `radius-md`, **elevação 1**, padding 16, inteiro tocável ou com uma ação clara | Comanda, tile de mesa, produto no QR |
| **Floating** | Camada temporária **por cima** | `surface-elevated`, elevação 2 ou 3 | Menu, popover, dialog, sheet, snackbar |

### 16.2 Regras anti-card-soup

1. **Um nível de aninhamento.** Panel contém linhas, divisórias e seções, **nunca cards com borda e sombra**. Card não contém card.
2. **Métrica não é card.** Um conjunto de KPIs vira **um Panel com strip** de 2–4 números separados por divisória vertical (`AStatStrip`), não quatro cards.
3. **Um título não precisa de caixa.** Se a única função da caixa é "agrupar um título com seu conteúdo", use Section.
4. **Linha antes de card.** Lista de pessoas, pedidos, eventos ou produtos na gestão = `AListRow` dentro de um Panel. Card é para objetos que vivem em grade espacial (mesas, comandas) ou que são visuais (produto com foto).
5. **No máximo 3 Panels por viewport** numa tela de gestão. Mais que isso pede tabs ou disclosure.
6. **Nada de ícone decorativo em título de Panel ou Section.** O título com o texto basta.

---

## 17. Data tables

### 17.1 Desktop (≥ 1024) — `ADataTable`

| Elemento | Especificação |
|---|---|
| Estrutura | `<table>` semântica dentro de um Panel (`radius-lg`, padding 0), `caption` sr-only com o nome da tabela |
| Toolbar (acima) | Busca (`ATextField` com ícone) · `AFilterChip`s · contagem "128 pessoas" (`caption`, `aria-live="polite"`) · ações da tabela à direita (ghost sm) |
| Cabeçalho | `surface-subtle`, Label 13/500 `text-secondary`, sentence case, **sticky** dentro do Panel. Ordenável: botão no cabeçalho + ícone de seta 16 + `aria-sort`. |
| Linha | Altura **48** (confortável, padrão) ou **40** (compacta, por preferência). Body-sm 14. Divisória hairline. Hover `surface-subtle`. |
| Selecionada | `primary-subtle` + checkbox marcado (se houver seleção) + `aria-selected`. **Sem side stripe.** |
| Alinhamento | Texto à esquerda, **números à direita com `tabular-nums`**, status com `AStatusBadge`, datas no formato curto do locale |
| Primeira coluna | Identificador principal em `text-primary` 500. Secundário (e-mail, ID) em caption abaixo, **não** numa coluna separada. |
| Clique na linha | Abre o **painel de detalhe** à direita (lista + detalhe, `--pane-detail`), ou navega se o detalhe for complexo. A linha inteira é alvo, com `Enter` no teclado. |
| Ações por linha | Até 1 ação visível (ghost sm) e um menu de reticências (`AMenu`) com o resto. Visíveis em hover/foco no desktop e **sempre focáveis por teclado**. |
| Seleção em lote | Checkbox na primeira coluna. A barra de ações em lote substitui a toolbar enquanto houver seleção. |
| Paginação | "Carregar mais" ou paginação simples (mostrando "1–50 de 128"). Rolagem infinita só em logs. |
| Estados | Loading: 6 linhas skeleton com as colunas reais. Vazio: `AEmptyState inline` dentro do Panel. Sem resultado de filtro: "Nenhum resultado para…" + "Limpar filtros". Erro: `AErrorState` dentro do Panel. |
| Colunas | Máximo de 7 visíveis. Prioridade definida por coluna (P1 sempre, P2 a partir de medium, P3 só em expanded). |

### 17.2 Tablet (768–1023)

Mesma tabela, só com as colunas P1 e P2. O detalhe abre como **side sheet** por cima da tabela, não como painel fixo.

### 17.3 Mobile (< 768) — sem tabela

- Vira **lista de `AListRow`**: linha 1 com o identificador (component-title) e o valor principal à direita (`tabular-nums`); linha 2 com meta P2 (caption `text-secondary`) e `AStatusBadge`.
- **Proibido** fazer rolagem horizontal da tabela inteira.
- Ordenar e filtrar ficam num botão "Filtrar" que abre um `ASheet`, com o número de filtros ativos no botão.
- Toque na linha abre o detalhe em tela cheia (rota) ou num sheet. As ações de linha vão para o detalhe.

### 17.4 Onde aplicar

Equipe, Histórico de fechamento, Avaliações, Produtos (gestão), Convites, Atividade (log).

---

## 18. Menus — `AMenu`

| Aspecto | Especificação |
|---|---|
| Trigger | Botão com `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` |
| Contêiner | `role="menu"`, `surface-elevated`, elevação 2, `radius-md`, padding 4, largura mínima de 200 e máxima de 320 |
| Item | `role="menuitem"` / `menuitemradio` / `menuitemcheckbox`. Altura **36 (fine) / 44 (touch)**, `radius-sm`, padding 12. Ícone leading 20 opcional (alinhado em todos os itens ou em nenhum). Atalho ou valor à direita em caption. |
| Item ativo/marcado | Check 16 à direita + `aria-checked`. Hover/foco: `surface-subtle`. |
| Destrutivo | Texto e ícone `danger`, sempre **por último** e separado por divisória |
| Grupos | Divisória hairline e rótulo opcional em caption `text-tertiary` (`role="group"` + `aria-label`) |
| Posição | Ancorado ao trigger, abrindo para baixo e alinhado ao início. **Flip e shift** nas bordas da viewport. `transform-origin` no trigger. |
| Abrir | Clique, `Enter`, `Space` ou `↓` abrem e focam o primeiro item. `↑` foca o último. |
| Navegar | `↑`/`↓` (com volta ao início), `Home`/`End`, **typeahead** pela primeira letra. Itens desabilitados são pulados. |
| Fechar | `Esc` fecha e **devolve o foco ao trigger**. `Tab` fecha e segue o fluxo. Clicar fora fecha. Selecionar um item fecha (exceto checkbox múltiplo). |
| Compact | Menus com mais de 6 itens, com descrição ou com ação destrutiva abrem como **`ASheet` de ações** (lista grande de 52 px, "Cancelar" no fim). |
| Motion | §10.2 (nasce do trigger) |

Substitui: `LanguageSwitcher`, `ThemeSwitcher`, `RestaurantSwitcher`, `UserMenu` e o seletor de garçom do drawer de mesa (P1-9).

---

## 19. Dialogs, sheets, drawers

### 19.1 Quando usar cada um

| Padrão | Use para | Não use para |
|---|---|---|
| **`ADialog`** (centralizado, modal) | Decisão que bloqueia (confirmar ação destrutiva), formulário curto (≤ 5 campos), escolha simples (transferir mesa) | Conteúdo longo, detalhe de objeto, navegação |
| **`ASheet` bottom** (compact) | Tudo que é contextual no mobile: detalhe de mesa, detalhe de pedido, carrinho, ações, filtros. **Um `ADialog` vira `ASheet` automaticamente em compact.** | Avisos simples (use `ASnackbar`) |
| **`ASheet` side** (medium/expanded) | **Detalhe que mantém o contexto** da lista ou do mapa por trás: mesa (no mapa), pedido, pessoa (tablet), atividade | Fluxos de várias etapas (use página) |
| **Painel de detalhe fixo** (expanded) | Lista + detalhe na gestão (Equipe, Produtos), sem modal, lado a lado | — |
| **Drawer de navegação** | Não existe mais como navegação principal (§11). Só o sheet "Mais". | — |
| **Página** | Fluxo longo, de várias etapas, ou que precisa de URL (editar produto completo, onboarding) | — |

### 19.2 Comportamento comum (`ADialog` e `ASheet`)

Herda do `ABottomSheet` atual, que já é a melhor implementação do app.

- `role="dialog"`, `aria-modal="true"` (exceto side sheet não-modal), `aria-labelledby` apontando para o título.
- **Foco:** vai para o primeiro campo, ou para o título se não houver campo. Fica **preso** enquanto aberto (modal) e **volta** ao elemento que abriu ao fechar.
- **Fechar:** `Esc`, clique no scrim, botão fechar (`AIconButton` 44, canto superior direito) ou arrastar para baixo (bottom sheet).
- **Formulário sujo** pede confirmação ao fechar ("Descartar alterações?" com Descartar / Continuar editando).
- **Scroll do `body` travado** enquanto modal. O conteúdo rola dentro, com header e footer fixos.
- **Footer de ações:** primary à direita (desktop) ou em full-width embaixo (compact), com padding de safe-area.
- **Empilhamento:** no máximo 2 (ex.: side sheet de mesa + dialog de transferir). O de baixo escurece mais.
- **Camadas (tokens, corrigem P1-11):** `--z-sticky: 10` · `--z-nav: 20` · `--z-menu: 30` · `--z-sheet: 40` · `--z-dialog: 50` · `--z-snackbar: 60`.

### 19.3 Medidas

| | Largura | Altura | Radius | Elevação |
|---|---|---|---|---|
| `ADialog` sm / md | 400 / 560 | auto, máx. 85vh | lg | 3 + scrim |
| `ASheet` bottom | 100% | auto, máx. 92vh. Detalhe de mesa: **tela cheia** | lg (topo) | 3 + scrim, handle de 36×4 |
| `ASheet` side | `--pane-detail` (420); 560 para conteúdo rico | 100% | lg (lado interno) | 3; scrim só quando modal |

### 19.4 `AConfirmDialog`

Construído sobre `ADialog`. Título = pergunta específica ("Anular la sesión de Mesa 12?"). Texto = **consequência concreta**. Botões "Cancelar" (secondary) e verbo destrutivo (danger). Para ação reversível, **não use**: use snackbar com "Desfazer".

---

## 20. Feedback

### 20.1 Matriz: o que usar

| Situação | Componente |
|---|---|
| Ação concluída (salvar, aprovar, enviar, mudar disponibilidade) | **`ASnackbar`** |
| Condição persistente da página ou seção (dia não aberto, offline, sem permissão para parte da tela) | **`AAlert`** |
| Falha ao carregar o conteúdo de uma área | **`AErrorState`** (substitui a área) |
| Área sem dados (vazio legítimo) | **`AEmptyState`** |
| Primeira carga | **`ASkeleton`** |
| Ação em andamento | Loading **no botão** |
| Recarga em segundo plano | Indicador no `context` do `APageHeader` ("Atualizando…") ou uma barra de progresso de 2 px no topo do Panel. **O conteúdo fica.** |
| Erro de validação de campo | No campo (§14) |

### 20.2 Componentes

**`ASnackbar`**
- Posição: compact, centralizado acima da bottom nav; medium e expanded, inferior centralizado.
- Visual: `surface-elevated` invertido (fundo `text-primary`, texto `background`). Texto Body 15. Elevação 2, `radius-md`, largura máxima de 480.
- Conteúdo: uma frase específica ("Mesa 12 cerrada") e no máximo **uma ação** ("Desfazer", "Ver").
- Duração: 4 s, ou 6 s com ação. Pausa no hover/foco. **Fila de um por vez.**
- Leitor de tela: `role="status"` (polite).
- Erro: snackbar só para erro **transitório de uma ação** ("No se pudo aprobar. Reintentar"). Erro de conteúdo é `AErrorState`.

**`AAlert`**
- Inline no fluxo, no topo da área que afeta. Fundo `*-subtle`, ícone 20 no tom, título Body 500, texto Body-sm e ação opcional (secondary sm).
- Tons: info, success, warning, danger. Sem borda lateral colorida.
- Dispensável só se a condição não persistir. `role="status"`; `role="alert"` só para danger que exige ação imediata.

**`AErrorState`**
- Substitui o conteúdo da área (Panel ou página).
- Ícone 24 `text-secondary`, título component-title, explicação Body `text-secondary` e ação primária **"Reintentar"** (sempre que fizer sentido).
- Mensagens por `kind`, mapeadas uma única vez (fim dos ternários inline, P1-5):

  | `kind` | Título (es-ES de referência) | Ação |
  |---|---|---|
  | `network` / offline | "Sin conexión" | Reintentar (automático ao voltar online) |
  | `forbidden` (403) | "No tienes acceso a esta sección" | Volver |
  | `not_found` (404) | "No encontramos esto" | Volver a la lista |
  | `conflict` (409) | "Alguien cambió esto mientras tanto" | Recargar |
  | `rate_limited` (429) | "Demasiados intentos. Espera un momento" | Reintentar (desabilitado com contagem) |
  | `server` / `generic` | "Algo salió mal" | Reintentar |

**`AEmptyState`**
- `inline` (dentro de uma lista ou Panel): uma linha Body `text-secondary` e uma ação ghost opcional.
- `page` (primeira vez de um módulo): ícone 24, título section-title, uma frase do que vai aparecer aqui e **uma** ação primary ("Crear la primera categoría"). Sem permissão, a frase explica quem pode fazer.
- **Sem ilustração decorativa.** O empty state ensina o próximo passo.

**`ASkeleton`**
- Blocos `surface-subtle` com o formato do conteúdo real (linhas, strip de métricas, comandas).
- Aparece só depois de 300 ms. Pulso conforme §10.
- `aria-busy="true"` na área e texto sr-only "Cargando…".

**Loading**
- `ASpinner` 16/20 dentro de botões, ou em áreas muito pequenas. **Nunca** um spinner centralizado com `py-24` como estado de página (P2-2).

### 20.3 Regras

- **Toda ação do usuário tem uma resposta visível** em até 100 ms (pressed) e um desfecho (sucesso ou erro).
- Toda mensagem é **humana e específica**. Nunca código de status cru (regra existente).
- Toda mensagem passa pelo i18n nos três locales.

---

## 21. Estados operacionais

### 21.1 Definição

| Estado | Significa | Cor (texto/ícone) | Fundo | Ícone (Phosphor) | Texto | Peso visual |
|---|---|---|---|---|---|---|
| **normal** | Tudo bem, nada a fazer | `text-secondary` | nenhum (`surface`) | do objeto (`PhUsers`, `PhReceipt`), `regular` | Rótulo do estado ("Ocupada", "En preparación") | Repouso: título 600, resto 400 |
| **attention** | **Precisa de alguém agora**, mas não está atrasado (novo pedido a aprovar, chamado, pronto para servir) | `primary-text` | `primary-subtle` | `PhBellRinging` (chamado) · `PhHandPalm` (aprovar) · `PhBellSimple` (pronto) `fill` | Verbo do que fazer ("Aprobar pedido", "Llaman") | Título 600, badge de contagem `primary` |
| **warning** | Começando a atrasar ou em risco | `warning` | `warning-subtle` | `PhClock` `fill` | "Esperando 12 min" | Timer 700 no tom |
| **critical** | Atrasado, bloqueado ou falha que impede o serviço | `danger` | `danger-subtle` | `PhWarningOctagon` / `PhWarning` `fill` | "Retrasado 25 min", "Sin conexión" | Título 700, ícone 24, posição priorizada (vai para o topo da lista) |
| **success** | Concluído e confirmado (pago, servido, pronto na cozinha) | `success` | `success-subtle` (transitório) | `PhCheckCircle` `fill` | "Servido", "Pagada" | Normal. O destaque some (§10). |
| **disabled** | Indisponível ou inativo (mesa fora de serviço, produto esgotado) | `text-tertiary` | `surface-subtle` | `PhProhibit` | "Fuera de servicio", "Agotado" | 400, sem ação primária |

### 21.2 Regras

- **Os quatro canais sempre juntos:** cor, ícone, texto e peso. Um estado sem texto visível não existe. Exceção: o dot de 8 px em espaço mínimo, que exige `aria-label` e tooltip.
- **Estados diferentes têm ícones diferentes**, mesmo com a mesma cor. Isso corrige o problema atual em que `waiter_requested` e `bill_requested` são ambos "critical" e `waiting_approval` e `preparing` são ambos "warning".
- **Mapeamento dos estados de mesa atuais** (`primary_status` do backend):

  | `primary_status` | Estado SALOA | Texto | Ícone |
  |---|---|---|---|
  | `free` | normal (variante "livre": contorno hairline, sem fill) | Libre | `PhArmchair` |
  | `occupied` | normal | Ocupada · 4 pax · 32 min | `PhUsers` |
  | `waiting_approval` | **attention** | Aprobar pedido | `PhHandPalm` |
  | `preparing` | normal | En cocina | `PhCookingPot` |
  | `ready` | **attention** | Listo para servir | `PhBellSimple` |
  | `waiter_requested` | **attention** (vira critical por tempo [contrato]) | Llaman | `PhBellRinging` |
  | `bill_requested` | **attention** | Pide la cuenta | `PhReceipt` |

  `preparing` deixa de ser warning: estar em preparo é o normal. A cor chama atenção só para o que pede ação.
- **Escalonamento por tempo** (attention → warning → critical) usa limites vindos do backend ou dos ajustes do restaurante **[contrato]**. Se não existirem, **não invente números**: mostre o tempo sem escalonar e registre a lacuna.
- **Prioridade de ordenação** em listas operacionais: critical, warning, attention, normal, success, disabled. Dentro de cada grupo, o mais antigo primeiro.
- **`AStatusBadge`** é a única forma de mostrar um estado em texto curto (altura 24, `radius-sm`, ícone 16 + Label 13).

### 21.3 Dicionário de ícones (um significado por ícone)

| Significado | Ícone |
|---|---|
| Chamado de garçom | `PhBellRinging` |
| Pedido a aprovar | `PhHandPalm` |
| Pronto para servir | `PhBellSimple` |
| Conta pedida | `PhReceipt` |
| Em preparo | `PhCookingPot` |
| Tempo / atraso | `PhClock` |
| Atrasado / crítico | `PhWarningOctagon` |
| Concluído | `PhCheckCircle` |
| Indisponível | `PhProhibit` |
| Pessoas | `PhUsers` |
| Mesa livre | `PhArmchair` |
| Nota do cliente | `PhNotePencil` |
| Alérgeno | ícone próprio do alérgeno + nome |
| Conexão em tempo real | `PhWifiHigh` / `PhWifiSlash` |

---

## 22. Kitchen Design (KDS)

> Corrige o **P0-2**. Tablet landscape first (1024–1366 px), legível a 1,5–2 m, com mãos molhadas ou de luva.

### 22.1 Layout

```
┌ barra 48px: Restaurante · ● En directo · 21:47 · [Sair do modo cozinha] ┐
│ Por aceptar (3)   │ Aceptados (2)    │ En preparación (5) │ Listos (2)     │
│ ┌──────────────┐  │ ┌──────────────┐ │ ┌──────────────┐   │ ┌──────────┐  │
│ │ Mesa 12  14:32│ │ │ ...          │ │ │ ...          │   │ │ ...      │  │
│ │ #A-104   ⏱ 8m │ │ │              │ │ │              │   │ │          │  │
│ │ 2  Croquetas  │ │ │              │ │ │              │   │ │          │  │
│ │    sin gluten │ │ │              │ │ │              │   │ │          │  │
│ │ [ ACEPTAR   ] │ │ │              │ │ │              │   │ │          │  │
│ └──────────────┘  │ └──────────────┘ │ └──────────────┘   │ └──────────┘  │
└───────────────────┴──────────────────┴────────────────────┴───────────────┘
```

- **Abre na fila, não em métricas.** O dashboard da cozinha vai para a gestão (Painel → Análise → Cozinha), ou fica como aba secundária para quem tem permissão de relatórios.
- **Colunas por status** (os status reais do backend: `confirmed` / `accepted` / `preparing` / `ready`). Cada coluna é um **Panel** (`surface-subtle`, sem borda) com cabeçalho fixo "Nome · contagem" e rolagem vertical própria.
- **≥ 1180 px:** 4 colunas visíveis. **1024–1179:** 3 visíveis e a 4ª por rolagem horizontal com snap; a coluna "Listos" fica fixa à direita. **< 1024 (tablet portrait e mobile):** um `ASegmented` de status com contagem, mostrando uma coluna por vez. Isso é exceção, não o padrão.
- **Modo imersivo** (§11.3): sem rail e sem top bar.

### 22.2 Comanda (`AKitchenTicket`)

| Parte | Especificação |
|---|---|
| Card | `surface`, elevação 1, `radius-md`, padding 16, largura de 280–340. **O card inteiro tocável** abre o detalhe. |
| Cabeçalho | **Mesa** em `text-section-title` 20/600 · nº do pedido em caption · **timer** `text-timer` 28/700 `tabular-nums` à direita |
| Tempo | Conta desde a criação (ou desde a entrada no status, conforme o contrato). Escalonamento normal → warning → critical por limite **[contrato]**: no warning, timer e ícone `PhClock` ficam no tom e o cabeçalho ganha `warning-subtle`; no critical, `PhWarningOctagon`, o texto "Retrasado" e o card inteiro com `danger-subtle`. |
| Itens | Quantidade 17/700 `tabular-nums` (coluna fixa de 32 px) + nome 17/500. Modificadores 15/400 `text-secondary`, recuados. **Texto de KDS = escala × 1,13.** |
| Notas | Bloco `warning-subtle` com `PhNotePencil` e texto 15/500, sempre visível, nunca truncado |
| Alérgenos | Linha própria, ícone + nome, `danger` se marcado pelo cliente |
| Ação | **Uma** primária full-width com **56 px** (variante `lg` + `kds`, alinhada à recomendação de 56 px para telas touch fixas/quiosque do ui-ux-pro-max) com o próximo passo ("Aceptar", "Empezar", "Listo"). Sem segundo botão: o detalhe abre ao tocar no card. |
| Mais antigo | Já é indicado pela ordem (mais antigo no topo) e pelo timer. O selo "Más antiguo" sai. |

### 22.3 Interação

- **Avançar é otimista:** a comanda anima para a próxima coluna (FLIP de 200 ms) e um snackbar "Mesa 12 → En preparación · Deshacer" fica 5 s. **Sem diálogo de confirmação.**
- **Nova comanda:** entra no topo da coluna com destaque único (§10) e som opcional (já existe a infraestrutura de desbloqueio de áudio). Nunca piscar em loop.
- **Toque** inicia o feedback no pointer-down. Os alvos têm no mínimo 56 px na ação principal e 44 nos demais. Nada depende de hover.
- **Conexão:** perder o tempo real mostra `AAlert` warning fixo no topo da fila ("Sin conexión en directo — mostrando datos de hace 2 min") e um "Reintentar".

### 22.4 Visual

- **Tema:** respeita a preferência do dispositivo, persistida por dispositivo. O Dark é recomendado para cozinhas com pouca luz.
- **Contraste:** todo texto da comanda é `text-primary` ou `text-secondary` (nada de `text-tertiary`). O timer em warning/critical usa o tom de status, que passa AA nos dois temas (§3).
- **Densidade alta** = espaçamento compact (12 entre comandas e 16 interno), não fonte menor.

---

## 23. Waiter Design

> Corrige o **P0-3** e o **P1-10**. Mobile first (375 px), com uma mão, andando.

### 23.1 Estrutura

- **Bottom nav** (§11.4): **Sala** (tela inicial), **Serviço**, Cozinha (se tiver permissão), **Mais**.
- **Faixa "Ahora"** no topo de Sala e de Serviço: lista horizontal de itens acionáveis (chamados, pedidos a aprovar, prontos para servir, contas), ordenada por §21.2. Cada item é um card compacto de 64 px de altura com ícone de estado, mesa, verbo e tempo. **Um toque faz a ação ou abre o detalhe já na ação.** Se não há nada, a faixa colapsa numa linha "Todo en orden" (sem caixa).
- **Sala = grade de mesas:** tiles de mesa em 2 colunas (375) ou 3 (≥ 414), com no mínimo 96 px de altura. O tile mostra nome (component-title), estado (§21, os quatro canais), pessoas e tempo (`tabular-nums`). Um filtro `ASegmented` "Todas / Mis mesas" acima. Zonas como `ATabs` quando houver mais de uma.
- **Serviço = lista por urgência:** pedidos a aprovar, depois mesas com atenção, depois o resto. Disponibilidade de produtos e "Mis valoraciones" vão para "Mais" ou para o fim da página, nunca competindo com a operação.

### 23.2 Detalhe da mesa

- **Sheet em tela cheia** (não um drawer de 384 px):
  - header com mesa, estado e garçom;
  - `ATabs` **Pedidos / Cuenta / Mesa**;
  - footer fixo com a **ação primária do momento** (Aprobar, Marcar servido, Cobrar, Cerrar), em `lg` full-width na zona do polegar.
- Ações raras (transferir, reatribuir garçom, anular) ficam num `AMenu` de reticências no header, que em compact abre como action sheet.
- Fechar volta para a grade **com a rolagem preservada**.

### 23.3 Regras

- **Ações críticas na metade inferior da tela.** Nada importante nos cantos superiores.
- **Alvos de pelo menos 44 px** com 8 de espaço. Ação primária de sheet com 52.
- **Otimista e com "Desfazer"** para servir, aceitar chamado e mudar a disponibilidade de produto. **Espera o servidor** para cobrar e fechar a conta (dinheiro).
- Novo chamado ou pedido pronto: snackbar global com "Ver" e badge na bottom nav. Vibração (`navigator.vibrate`) curta e opcional, só se o usuário habilitar.
- **Offline:** `AAlert` fixo abaixo da top bar ("Sin conexión. Los cambios no se enviarán"). Ações que exigem servidor ficam desabilitadas com explicação.
- **Contagem de toques (alvo):** atender chamado = 1 · aprovar pedido = 1 (pela faixa) · abrir mesa = 2 (tile → "Abrir mesa" com stepper de pessoas) · cobrar = 3.

---

## 24. Management Design

> Desktop first (1440 px), uso deliberado e por mais tempo, com boa densidade.

### 24.1 Padrões

- **Lista + detalhe:** `ADataTable` (§17) à esquerda e painel de detalhe fixo (`--pane-detail`, 420) à direita em ≥ 1280. Abaixo disso, side sheet. A seleção fica na URL (`?selected=id`), para poder compartilhar e para o voltar do navegador funcionar.
- **Filtros persistentes** na query da URL e restaurados ao voltar.
- **Métricas = `AStatStrip`:**
  - um Panel com 2–4 números;
  - cada número: rótulo caption `text-secondary`, valor `text-metric` `tabular-nums` e comparação opcional ("+12% vs. martes pasado") com ícone de seta e texto, **nunca só cor verde/vermelha**;
  - **não usar** uma grade de 4+ MetricCards.
- **Gráficos:** carregar `dataviz` antes. Um gráfico por pergunta, título que **afirma** ("El pico es a las 14:00"), padrão de ênfase (§3.5). Gráficos ficam na aba Análise, nunca na tela operacional.
- **Formulários de configuração (Ajustes, produto):**
  - **Ajustes:** navegação lateral por seção (expanded: lista de 200 px à esquerda; compact: lista → página). Cada seção é uma Section, não um card.
  - Largura máxima de `--form-max` (720).
  - Campos que dependem de salvar: **barra de salvar fixa** aparece no rodapé quando o formulário está sujo ("Tienes cambios sin guardar · Descartar · Guardar").
  - Toggles de efeito imediato: `ASwitch` fora do formulário (§14.2).
- **Teclado:** `/` foca a busca, `Esc` fecha o painel de detalhe, `↑`/`↓` navegam linhas da tabela focada. Atalhos documentados num `?` (P2).

### 24.2 Painel (Dashboard) operacional do gerente

1. **Strip "Ahora"** (mesas ocupadas, pedidos ativos, cobrado hoje, atenções), em uma linha.
2. **Precisa de atenção:** lista de alertas (§21), primeiro.
3. **Mapa da sala** (com alternativa em lista).
4. **Cozinha e equipe** como Sections compactas (linhas, não cards).

O "health score" 0–100 deixa de ser o elemento principal do cabeçalho. Se continuar, vira texto no `context` ("3 mesas necesitan atención"). O anel é removido.

---

## 25. Public QR Design

> Consumer experience. O cliente nunca leu um manual e tem um celular numa mão e um copo na outra.

| Aspecto | Regra |
|---|---|
| Tom | **O mais expressivo do sistema:** fotos grandes, o laranja como cor de CTA usada com mais liberdade, título display na entrada. Sem perder a calma: um CTA por tela. |
| Tipografia | Body **17/24** (escala × 1,13), títulos de produto 20/600, preço `metric-sm` `tabular-nums` |
| Navegação | Categorias como `AFilterChip` de seleção única, fixas no topo com rolagem horizontal e fade nas bordas. O ativo segue a rolagem. Sem bottom nav. |
| Produto | Card com foto (proporção fixa 4:3 ou 1:1, reservada para não pular o layout, carregamento lazy), nome, 2 linhas de descrição, preço e alérgenos (ícone + nome). Toque abre `ASheet` com detalhe, modificadores e `AStepper`. |
| CTA principal | Barra fixa no rodapé com safe-area: "Ver pedido · 3 · 24,50 €" em `primary` `lg`. Aparece só com itens no carrinho. |
| Ações de mesa | "Llamar al camarero" e "Pedir la cuenta" num menu claro e sempre acessível (botão na top bar), com confirmação de envio por snackbar e estado ("Camarero avisado hace 1 min"). |
| Idioma | Seletor visível na entrada e no header, com o nome do idioma escrito nele mesmo ("Valencià"), nunca bandeira |
| Marca | `--brand-glow` / gradiente permitidos **uma vez**: na tela de boas-vindas. Logo do restaurante quando houver. |
| Estados | Pedido enviado = tela de sucesso clara (ícone 24 `success`, título, o que acontece agora, tempo estimado se o backend der). Erro = explicação + Reintentar. O carrinho sobrevive a recarregar a página. |
| Acessibilidade | Alvos de pelo menos 48 px (público mais variado), contraste AA, sem gestos ocultos (o reel/feed sempre tem uma alternativa por botão) |
| Performance | Imagens otimizadas com `srcset`, o primeiro paint sem esperar fotos, a intro animada com no máximo 1,2 s e pulável, respeitando reduced-motion |

---

## 26. Responsive Design

| | **375 (compact)** | **768 (medium)** | **1440 (expanded)** |
|---|---|---|---|
| Navegação | Top bar 52 + bottom nav 56 | Rail 72 + top bar 56 | Sidebar 240 + top bar 56 |
| Gutter | 16 | 24 | 40 |
| Page title | 24/30 | 28/34 | 28/34 |
| Ações do header | Primary full-width abaixo do título, o resto no menu | Inline, até 1 primary e 1 secondary | Inline, até 1 primary e 2 secondary |
| Lista/tabela | `AListRow` | Tabela P1+P2, detalhe em side sheet | Tabela completa + painel de detalhe fixo |
| Detalhe | Sheet em tela cheia ou rota | Side sheet de 420 | Painel fixo de 420 |
| Dialog | Vira bottom sheet | Dialog centralizado | Dialog centralizado |
| Grade de mesas | 2 colunas | 4 colunas ou mapa | Mapa + lista de atenção lado a lado |
| KDS | Segmented de status, uma coluna | Portrait: 2 colunas · Landscape (1024+): 3–4 | 4 colunas |
| Formulário | 1 coluna, campos com 16 px de fonte | 1–2 colunas | Máx. 720, 2 colunas só para pares curtos (CEP/cidade) |
| Strip de métricas | 2×2 | 4 em linha | 4 em linha |
| Snackbar | Acima da bottom nav, full-width menos 16 | Inferior centralizado | Inferior centralizado |

Regras:

- **Breakpoints** (Tailwind padrão mantido): `md` 768 = medium, `xl` 1280 = expanded, `lg` 1024 = limiar do KDS e da tabela.
- **Projetar as três juntas** (regra do `CLAUDE.md` §16). Cada tela nova documenta o comportamento nas três classes antes de codar.
- **Sem rolagem horizontal de página** em nenhum tamanho. A rolagem horizontal é permitida só em fileiras de chips, colunas de KDS e faixa "Ahora", e sempre com indicação visual (fade ou snap).
- **Orientação:** tablet em rotação mantém o estado (aba, seleção, rolagem).
- **Mapa da sala** (P1-8): marcadores escalam proporcionalmente ao container, com tamanho mínimo de alvo de 44. Abaixo de 768, a lista é o padrão e o mapa é opcional ("Ver mapa").

---

## 27. Accessibility

Requisitos **mínimos** (bloqueiam merge):

| Área | Requisito |
|---|---|
| Contraste | WCAG AA: **4,5:1** texto, **3:1** texto ≥ 18,66 px bold / 24 px, ícones e limites de controle. Calcular, não estimar. Os pares da §3 já são verificados. Novos pares exigem cálculo. |
| Foco | `:focus-visible` com anel de 2 px `focus-ring` e offset 2 em **todo** interativo. Nunca `outline: none` sem substituto. O foco não fica escondido sob barras fixas (`scroll-margin`). |
| Teclado | Tudo operável por teclado. Ordem lógica. Padrões ARIA de tabs, menu, dialog e radiogroup seguidos à risca (§15, §18, §19). Sem armadilha de foco fora de modais. |
| Alvo | **44×44 px** mínimo com 8 px de espaço. QR: 48. Ação principal de KDS: 56. Exceção: `sm` só em `pointer: fine`, com área de toque expandida. |
| Foco não encoberto (WCAG 2.4.11) | Barras fixas (top bar, bottom nav, barra de salvar, footer de sheet, faixa "Ahora") nunca cobrem o elemento focado: `scroll-padding-top`/`scroll-padding-bottom` = altura das barras (tokens `--bar-top`, `--bar-bottom`), e o snackbar não cobre o controle focado |
| Movimentos de arrastar (WCAG 2.5.7) | Todo arrasto tem alternativa de um ponteiro sem arrastar: editor de planta (selecionar a mesa + setas/botões de posição), fechar sheet (botão fechar), reordenar (menu "Mover para…") |
| Autenticação acessível (WCAG 3.3.8) | Login permite colar e gerenciador de senhas (`autocomplete` correto), sem quebra-cabeça cognitivo |
| Movimento | `prefers-reduced-motion` respeitado em todas as transições (§10.3). Nenhum loop infinito. |
| Transparência e contraste | `prefers-reduced-transparency` e `prefers-contrast: more` suportados (§3.5, §8) |
| Semântica | `<button>` para ações e `<a>` para navegação. Um `h1` por página e headings em ordem. Landmarks (`nav`, `main`, `header`). Listas como `ul`/`ol`. Tabelas como `table` com `th scope`. |
| ARIA | Só quando o HTML não basta: `aria-label` em botão só-ícone, `aria-expanded`/`aria-controls` em disclosure, `aria-current="page"` na navegação, `aria-live="polite"` para contagens e snackbar, `aria-invalid` + `aria-describedby` em erros, `aria-busy` em áreas carregando |
| Cor | Nunca o único canal de significado (§21: quatro canais) |
| Texto | Zoom de 200% sem perda de conteúdo. Nada abaixo de 12 px. Spacing de controles em rem. |
| Formulários | Label visível, erro textual junto do campo, foco vai para o primeiro erro ao enviar |
| Mídia | `alt` significativo em fotos de produto (o nome do produto) e `alt=""` em decorativas. Logo com o nome da marca. |
| Idioma | `lang` do `<html>` acompanha o locale ativo. Conteúdo do restaurante com `lang` próprio quando difere. |

---

## 28. NEVER DO THIS

Cada item vem de um achado real da auditoria (`UI_AUDIT.md`) ou da direção visual.

| ❌ Nunca | ✅ Em vez disso | Origem |
|---|---|---|
| `text-primary` / `#FF7300` como cor de texto, link ou ícone em superfície clara | `primary-text` (`#A84300`) | P0-1 (2,58:1) |
| Botão outlined ou text laranja dentro de sheet claro | `secondary` (texto neutro) ou `ghost` | P0-1 (2,03:1) |
| KDS com uma aba por status | Colunas lado a lado | P0-2 |
| Tela operacional abrindo num dashboard de métricas | Abrir na fila ou na lista de ação | P0-2 |
| Hambúrguer como navegação principal no mobile | Bottom nav (§11.4) | P0-3 |
| `role="dialog"` sem `aria-modal`, scrim, Esc ou focus trap | `ADialog`/`ASheet` | P0-3 (`TableDetailsDrawer`) |
| Modal próprio com `fixed inset-0 z-[60]` | `ADialog` + tokens de z-index | P1-11 (`TransferTableDialog`, `FloorMapEditor`) |
| Segmented ou abas reescritos com Tailwind inline | `ASegmented` / `ATabs` | P1-1 (5 cópias) |
| Chip selecionado só por mudança de cor | `AFilterChip` com check + 600 | P1-2 |
| Botão de 20×20 ou ações com `py-1`/`py-1.5` | Alturas de token (32 fine / 44 / 52) | P1-3 |
| "Guardado" em texto cinza ao lado do botão como único feedback | `ASnackbar` | P1-4 |
| Ternário `error.kind === 'forbidden' ? … : …` no template | `AErrorState kind` | P1-5 |
| Caixa de erro sem "Reintentar" | `AErrorState` com ação | P1-5 |
| Card dentro de card, com borda, sombra e tom iguais | Panel + linhas (§16) | P1-6 |
| Grade de 4+ KPI cards no topo | `AStatStrip` | P1-6 / §6 da auditoria |
| Ícone decorativo ao lado de cada título de seção | Só o título | §6 da auditoria |
| Título da página na top bar **e** num `h2` na página | `APageHeader` com h1 | P1-7 |
| Página sem `h1` | `APageHeader` | P1-7 |
| Texto de 10 px (`text-[10px]`) | Mínimo de 12 px | P1-3 / P1-8 |
| `hover:scale-105` em elementos tocáveis | Mudança de cor, só com `hover: hover` | P1-8 |
| Dropdown reimplementado por componente | `AMenu` | P1-9 |
| Seções operacionais e pessoais empilhadas na mesma coluna (Serviço + "Mis valoraciones") | Priorização por urgência (§23) | P1-10 |
| Spinner centralizado com `py-24` como estado de página | `ASkeleton` | P2-2 |
| Lista de gestão sem tabela no desktop | `ADataTable` | P2-3 |
| `<select>` cru estilizado à mão | `ASelect` | P2-4 |
| `ASwitch` dentro de formulário com "Guardar" | `ACheckbox`, ou switch fora do form com efeito imediato | P2-5 |
| A mesma ação duas vezes na mesma tela ("Editar plano" ×2) | Uma, no contexto | P2-6 |
| Card explicando a arquitetura de informação ("Configuración vs operación") | Navegação e títulos claros | P2-7 |
| Larguras mágicas (380/400/420 px, `max-w-[560px]`) | `--pane-detail`, `--dialog-md` | P2-10 |
| `shadow`/`shadow-sm` do Tailwind, `rounded-2xl`, `rounded` | Tokens de §6/§8 | P2-11 |
| Borda lateral colorida (`border-l-4`) para status | Fundo `*-subtle` + ícone + texto | P3-2 |
| Grade de fundo com gradiente em mapas | Fundo liso; grade sutil só no modo edição | P3-3 |
| Mock HTML dentro de `src/` | `docs/design/reference/` | P3-4 |
| `opacity: .38` como estado disabled sobre laranja | Tokens disabled (§13.3) | Direção |
| Glassmorphism em card ou painel; dois glows na mesma tela | Translucência só em barras de navegação (§8); um glow por produto | Direção |
| Gradiente como fundo de botão, card ou seção | Fill sólido | Direção / `CLAUDE.md` |
| Botão de texto em pílula (`rounded-full`) | `radius-md` | Direção |
| Bounce, pulse ou shake em loop para chamar atenção | Destaque único (§10) + texto | Direção |
| Count-up de números em tela operacional | Valor direto | Direção |
| "¿Estás seguro?" | Pergunta específica + consequência, ou "Desfazer" | §2 |
| "OK", "Sí", "Enviar" como rótulo genérico | Verbo + objeto | §13.4 |
| Emoji como ícone de interface | Phosphor | `CLAUDE.md` §14 |
| Visual de iOS no navegador (switch verde, large title colapsando, tab bar copiada) | Os princípios, não os componentes | Direção |

---

## 29. Component roadmap

> **Não implementar agora.** Cada componente nasce quando uma tela real precisa dele (`CLAUDE.md` §17), mas **na ordem abaixo**, porque os P0 desbloqueiam as telas P0. "Evolui" = refatorar o componente existente mantendo a API compatível; "Novo" = criar.

### P0 — fundação e as três correções críticas

| Componente | Tipo | Desbloqueia |
|---|---|---|
| **Tokens v2** (cor §3, tipo §4, radius §6, sombra §8, motion §10, z-index e larguras) | Evolui `tokens.css` / `style.css` | Tudo, e o P0-1 de contraste |
| **`AButton` v2** (primary / secondary / ghost / danger · sm / md / lg · `as`) | Evolui | Todas as telas |
| **`AIconButton` v2** | Evolui | Shell, menus, sheets |
| **`ADialog` + `ASheet`** (bottom/side, comportamento §19.2) | Evolui `ABottomSheet` | P0-3, todos os modais |
| **`AAppShell` v2** (sidebar / rail / bottom nav + sheet "Mais") | Evolui `AppShellLayout` | P0-3 |
| **`APageHeader`** | Novo | Hierarquia de todas as páginas |
| **`AStatusBadge`** + mapa de estados §21 | Novo (substitui `useTableStatusStyle`) | KDS, Serviço, Sala |
| **`AKitchenTicket`** + layout de colunas | Novo | P0-2 |
| **`ASnackbar`** + `useSnackbar()` (fila) | Novo | Feedback de toda ação (exigido pelo KDS otimista) |

### P1 — consistência e feedback

| Componente | Tipo |
|---|---|
| `ATabs` | Novo (substitui `MenuSectionTabs`, abas do DayClose) |
| `ASegmented` | Novo (substitui `DashboardTabs`) |
| `AFilterChip` | Evolui `AChip` |
| `AMenu` | Novo (substitui os 4 dropdowns) |
| `AAlert` | Novo (substitui `DailyOperationBanner` como base) |
| `AErrorState` + mapeamento único por `kind` | Novo |
| `AEmptyState` (inline/page) | Novo (substitui 6 variações) |
| `ASkeleton` | Novo |
| `ATextField` v2 + `ATextarea` | Evolui |
| `ASelect`, `ACheckbox`, `ARadio` | Novo |
| `ASwitch` | Evolui `AToggle` |
| `APanel`, `ASection` | Novo (substituem a maior parte dos usos de `ASurface` + `SectionCard`) |
| `AListRow` | Novo |
| `ATableTile` (tile de mesa) + faixa "Ahora" | Novo (Waiter) |
| `AStepper` | Novo |

### P2 — gestão e refinamento

| Componente | Tipo |
|---|---|
| `ADataTable` (ordenação, seleção, colunas por prioridade) | Novo |
| `AStatStrip` | Novo (substitui as grades de `MetricCard`) |
| `ADetailPane` (layout lista + detalhe) | Novo |
| `ASettingsLayout` (navegação de seções + barra de salvar fixa) | Novo |
| `ABreadcrumbs` | Novo |
| `ATooltip` | Novo |
| `AAvatar` | Novo (extrair de `UserMenu`) |
| `ACombobox` | Novo |
| `ASpinner` | Renomeia `AProgress` |
| Atalhos de teclado (`?`) | Novo |

**Aposentar** ao fim da migração: `ASurface` (como API pública), `SectionCard`, `MetricCard`, `DashboardTabs`, `MenuSectionTabs`, `CategoryEmptyState`, `MenuEmptyState`, `ProductEmptyState`, `MenuSectionPlaceholder`, `dashboard/EmptyState`, `TransferTableDialog` (vira um uso de `ADialog`).

---

## 30. Migration strategy

**Sem big-bang.** Um padrão *strangler*: o novo sistema cresce ao lado do antigo, tela por tela, e cada passo pode ir para produção sozinho.

### 30.1 O que muda em relação ao `docs/design-system.md`

| Tema | AFORO (atual) | SALOA (novo) |
|---|---|---|
| Linguagem estrutural | Material Design 3 | Princípios Apple HIG (Apple quality, not Apple clone) |
| Neutros Light | Creme/areia quente (`#FBF3EA`) | Quase acromático (`#F5F5F3` / `#FFFFFF`) |
| Neutros Dark | Grafite neutro (`#17181C`) | Grafite neutro mais profundo (`#111113`), com degraus mais legíveis |
| Laranja | Mesmo valor para fill e texto | Fill `#FF7300` e texto `#A84300` separados |
| Papéis secondary/tertiary M3 | Existem (marrom/dourado) | **Removidos.** Ficam neutros e status. |
| Profundidade | Tonal + `shadow-card` em todo card | Flat por padrão; elevação só em objetos tocáveis e flutuantes |
| Raio | 4/8/12/16/28 | 6/10/14 |
| Botões | filled/tonal/outlined/text | primary/secondary/ghost/danger |
| Tipografia | System stack, 8 papéis M3 | Inter (com gate), 11 papéis, `tabular-nums` obrigatório |
| Navegação mobile | Drawer | Bottom nav |
| Referências 60/30/10 (`src/assets/images/ref`) | Governam o tratamento visual | **Continuam como referência de restrição** (ref 2: neutralidade, números fortes). A personalidade "orange energy" da ref 1 é reduzida ao laranja como sinal. A ref 3 continua válida só para a suavidade do Light. |

### 30.2 Fases

| Fase | Entrega | Risco | Validação |
|---|---|---|---|
| **0. Governança** | Aprovar este documento. Atualizar o `CLAUDE.md` §2–§7 para apontar para cá. Marcar `docs/design-system.md` como "legado — ver DESIGN_SYSTEM_SALOA.md". Corrigir o agent-browser no WSL (`sudo npx agent-browser install --with-deps`). | Nenhum (só docs) | Revisão humana |
| **1. Tokens v2 em paralelo** | Adicionar os tokens novos (`--color-fg`, `--color-surface-subtle`, `--color-accent`, `--radius-*`, `--duration-*`, `--z-*`…) **ao lado** dos `--md-sys-*`. Fazer os tokens antigos virarem **aliases** dos novos onde o significado é igual. **Correção imediata do P0-1:** `text-primary` antigo passa a apontar para `primary-text`. | Baixo: muda só valores, visual global e testável | Build + agent-browser em Light/Dark nas telas principais + revisão de contraste |
| **2. Primitivos P0** | `AButton`/`AIconButton` v2 (aceitando as variantes antigas como alias: `tonal`/`outlined` → secondary, `text` → ghost), `ADialog`/`ASheet`, `APageHeader`, `AStatusBadge`, `ASnackbar` | Médio | Cada primitivo validado isolado e em 1 tela |
| **3. Shell** | `AAppShell` v2: sidebar, rail e bottom nav. Atrás de um flag de build (`VITE_SHELL_V2`) até validar nas 3 classes de tamanho e nos 3 locales. | Médio-alto (caminho crítico) | Fluxo completo: login → cada destino → troca de restaurante, em 375/768/1440 |
| **4. Telas P0** | **4a. KDS** (`AKitchenTicket` + colunas) · **4b. Waiter** (Sala com faixa "Ahora", detalhe de mesa em sheet) · migrar `TableDetailsDrawer` → `ASheet` | Alto valor | Fluxos operacionais reais com usuários demo (cozinha, garçom), tablet landscape e mobile |
| **5. Primitivos P1 e telas restantes** | Uma tela por bloco: Serviço → Painel → Mesas → Carta → Equipe → Fechamento → Avaliações → Ajustes → Plataforma/Auth → QR público. Cada bloco troca **todos** os padrões daquela tela de uma vez (sem tela meio a meio). | Médio | agent-browser por tela |
| **6. Marca SALOA** | Bloco separado e aprovado: novos assets (`saloa-*.png`), primitivos `--brand-*` re-amostrados do logo SALOA, fonte confirmada contra o wordmark, troca de nome em i18n, `<title>`, favicon e alt. Renomear código só onde for visível ou necessário. | Baixo-médio | Revisão de marca + agent-browser |
| **7. Limpeza** | Remover os tokens `--md-sys-*`, os aliases e os componentes aposentados (§29). Um lint simples (script de grep no CI) que falhe com `rounded-xl`, `shadow-sm`, `text-[`, `z-[`, `#` hex em `.vue`. | Baixo | Build + busca por usos residuais |

### 30.3 Regras da migração

1. **Uma tela por vez, inteira.** Uma tela nunca mistura `SectionCard` com `APanel`. O bloco termina com a tela 100% no padrão novo.
2. **Compatibilidade antes de remoção.** Primitivo evoluído aceita a API antiga até a fase 7, e o uso antigo emite um aviso só em dev.
3. **Não tocar** em APIs, contratos, stores, auth, permissões nem regras de negócio. A migração é de apresentação. Onde uma regra nova depende de dado inexistente (limites de SLA, §21–22), registrar a lacuna e seguir sem inventar.
4. **Cada bloco segue o `CLAUDE.md` §19–20:** `/ui-ux-pro-max` antes, `npm run build`, agent-browser (funcional + visual) em Light/Dark, nos 3 locales e nas classes de tamanho relevantes, e relatório curto.
5. **Medir antes e depois** das telas P0: número de toques nos fluxos de §23.3 e contraste dos pares usados. O critério de aceite é cumprir as metas deste documento.
6. **Sem renomear AFORO → SALOA** fora da fase 6.

---

## 31. Revisão do documento

Revisão feita depois de redigir, com as quatro lentes pedidas. As correções que ela gerou **já estão incorporadas** no texto acima.

| Lente | Verificação | Resultado / ajuste feito |
|---|---|---|
| **impeccable** (integridade, modo *Operate*) | O sistema é específico do produto ou intercambiável? Toda regra é verificável? | Específico: estados mapeados aos `primary_status` reais, KDS com os status reais do backend, dicionário de ícones. **Ajustes:** cada valor de cor ganhou contraste calculado; "attention" deixou de reaproveitar warning para estados que só pedem ação; foram adicionados tokens de z-index e de largura (achados P1-11 e P2-10) que a primeira versão omitia. |
| **ui-ux-pro-max** (UX de restaurante) | Toques, rush, tablet, uma mão, cozinha | Metas de toque explícitas (§23.3); ação primária na zona do polegar; KDS sem confirmação, com "Desfazer"; alvos de 56 no KDS e 48 no QR. **Ajuste:** a regra `ASwitch` = efeito imediato contra `ACheckbox` = depende de salvar, que corrige um padrão confuso de Ajustes. **Achados da busca na base da skill:** (1) "foco não encoberto" (WCAG 2.2 AA) não estava coberto → adicionado scroll-padding pelas barras fixas (§27); (2) alternativa a arrastar (WCAG 2.5.7) para o editor de planta e para os sheets → adicionada; (3) a guia de quiosque/touch fixo recomenda 56 px → ação principal do KDS subiu de 52 para 56; (4) autenticação acessível → adicionada. A recomendação da base para "Restaurant/Food Service" (estilo *vibrant/block-based/claymorphism*) foi **rejeitada** deliberadamente: ela descreve sites de restaurante para consumidor, não software operacional. No máximo informa o tom do QR público (§25). |
| **frontend-design / taste** (anti-template) | Ainda parece "dashboard SaaS"? | Grade de KPI cards, ícone decorativo em título, health ring, side stripe e card-soup estão proibidos, com substitutos concretos (`AStatStrip`, `APanel`, `ASection`). A personalidade não vem de efeito: vem do laranja como sinal, da tipografia numérica e da calma. **Ajuste:** o gradiente e o glow ficaram restritos a um uso no login e um no QR, e o QR foi declarado como a superfície mais expressiva, para a marca ter onde respirar. **Achados da revisão com a skill:** (1) o Inter é a família padrão → mantido para a UI por legibilidade, com o display aberto a candidatas avaliadas contra o wordmark (§4.1); (2) strings de metadado com "·" e "→" anexado são marcas de template → regra de no máximo 2 separadores e nada de seta em rótulos (§4.3); (3) o fundo Dark `#111113` é o "near-black tingido" da lista de tells → **mantido de propósito**: é o canvas do KDS em cozinha escura e o degrau mais baixo de uma escala tonal real (não um preto decorativo), e os pares de contraste da §3.4 dependem dele. |
| **apple-design** (HIG, materiais, motion, tipografia) | É "Apple quality" ou "Apple clone"? | Princípios (os oito, feedback no pointer-down, interrupção, mesmo caminho de entrada e saída, tracking por tamanho, reduced motion/transparency/contrast) aplicados; componentes iOS literais vetados (§1, §28). **Ajustes:** translucência limitada às barras de navegação com fallback sólido; tracking negativo só ≥ 20 px; sheet decide fechar pela velocidade, não pela posição; bounce proibido sem gesto de arremesso. |

### Pendências declaradas (não bloqueiam o uso do documento)

1. **Fonte:** o Inter está recomendado, mas depende do gate de marca (§4.1).
2. **Laranja SALOA:** hoje é o laranja AFORO. Precisa ser re-amostrado quando os assets SALOA existirem (fase 6), e a §3 deve ser recalculada.
3. **Limites de tempo** (warning/critical) para KDS e chamados: **[contrato]** com o backend.
4. **Validação visual:** este documento ainda não foi confrontado com screenshots, porque o agent-browser está bloqueado no WSL. A primeira tela migrada (fase 4a) deve servir de prova e pode ajustar valores de spacing ou sombra. Qualquer ajuste volta para este documento.
