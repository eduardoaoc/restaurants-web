# AFORO restaurants-web — Regras de negócio

> Complementa `CLAUDE.md` e `docs/architecture.md`. Descreve o **domínio
> real** tal como o frontend o consome hoje — toda afirmação aqui foi
> conferida contra `src/types/*.ts` e os comentários que documentam o
> contrato OpenAPI do backend (`restaurants-api`). Nada aqui foi inventado;
> onde o contrato não deixa algo claro, isso é dito explicitamente na seção
> de gaps (§9).

## 1. Modelo de domínio (hierarquia)

```
Organization (1) ──< Restaurant (N)
     │                    │
     │                    ├──< Table ──< TableSession ──< Order
     │                    │                  │
     │                    │                  ├──< WaiterCall
     │                    │                  ├──< TableRequest
     │                    │                  └──< SessionBill ──< BillPayment
     │                    │
     └──< User (via role, escopo organização OU organização+restaurante)
```

- Um **User** nunca tem "um restaurante" — ele participa de 1..N
  organizações, e dentro de cada organização alcança 1..N restaurantes,
  cada combinação com seu próprio conjunto de permissões
  (`src/types/auth-context.ts`). Um Owner tipicamente vê todos os
  restaurantes da organização; staff operacional só os que lhe foram
  explicitamente atribuídos.
- **Staff** (`src/types/staff.ts`) é sempre vinculado a uma organização
  (`organization_users`) com `status: 'active' | 'inactive'` — isso é
  **diferente** do `status` de plataforma do usuário (que pode incluir
  `suspended`); o frontend nunca envia/mostra `suspended` aqui. Não existe
  endpoint de exclusão de staff — desativar é a única forma reversível de
  remover acesso.
- Papéis atribuíveis via `POST /staff` (`ASSIGNABLE_STAFF_ROLES`):
  `manager`, `waiter`, `kitchen`, `cashier`. `owner` nunca é atribuível por
  aqui (tem fluxo próprio, fora deste MVP).

## 2. Permissões (ver também `architecture.md` §6)

Três escopos independentes, cada ação checada pelo slug certo — nunca por
nome de papel:

| Escopo | Exemplos de slug | Quem avalia |
|---|---|---|
| Restaurante (tenant) | `manage_menu`, `manage_tables`, `create_orders`, `approve_customer_orders`, `view_operations`, `view_reports` | `usePermissions().can()` / `canAny()` |
| Organização | `manage_organization`, `manage_users` | `usePermissions().canOrganization()` |
| Plataforma | `view_platform_*`, `manage_platform_*` | `usePermissions().canPlatform()` |

`SERVICE_ACCESS_PERMISSIONS` é o conjunto que dá acesso à tela de operação
do garçom/caixa (`/app/service`): `view_operations`, `create_orders`,
`approve_customer_orders`, `serve_orders`, `record_payments`, `close_bill`,
`handle_table_requests`. Um funcionário pode ter **qualquer subconjunto**
desses — a tela se auto-organiza por seção, nunca bloqueia tudo-ou-nada.

`can_manage_table_structure` é **derivado pelo backend** por restaurante:
verdadeiro com `manage_floor_plan`, ou com `manage_tables` **e** a
configuração do restaurante `waiter_table_management_enabled`. Controla
criar mesa / mudar nome, número, capacidade, zona, layout — nunca o campo
`status` da mesa, que depende só de `manage_tables`.

## 3. Ciclo de vida de uma mesa / sessão (`TableSession`)

1. **Abrir** (`POST /tables/{table}/open`, `guest_count`) → cria uma
   `TableSession` (`status`, `payment_status` próprios, `opened_by_user_id`).
2. Durante a sessão: pedidos são criados (ver §4), garçom pode ser
   atribuído/desatribuído (`assign_waiters`), a sessão pode ser
   **transferida** para outra mesa (`transfer_tables`).
3. **Fechar a conta** (`SessionBill`, via `GET .../bill`): `can_close` é
   **sempre calculado pelo backend** — o frontend nunca decide
   localmente se uma sessão pode fechar.
4. **Pagamentos** (`BillPayment`): método `cash | card | other`, podem ser
   parciais (`payment_status: unpaid | partial | paid`).
5. **Recibo** (`BillReceipt`, `GET/.print .../receipt`) — documento
   **operacional**, nunca fiscal (sem IVA, sem número de fatura). Pode ser
   emitido antes, durante ou depois do pagamento/fechamento — nunca gateado
   por isso no frontend.
6. **Void** (`POST /table-sessions/{id}/void`) — encerra uma sessão aberta
   por engano: fica `closed` com `voided_at`, mas nunca conta como
   atendimento/turnover real. Pedidos pendentes de aprovação são
   cancelados; solicitações de mesa ainda abertas também.

## 4. Ciclo de vida de um pedido (`Order`)

```
waiting_approval → confirmed → accepted → preparing → ready → served
        │
        └──(reject)──> rejected
(cancelado em qualquer ponto anterior) → cancelled
```

- **Origem** (`OrderOrigin`): `customer_qr` (cliente via QR), `waiter`,
  `manager`, `cashier`. Pedidos **customer_qr** nascem em
  `waiting_approval` e exigem aprovação explícita de um funcionário.
  Pedidos criados por staff nascem já `confirmed` — nunca passam por
  aprovação.
- **Aprovação/rejeição** (`useOrderApprovals`, `POST
  /orders/{order}/approve|reject`): só é permitida se o pedido for
  exatamente `origin === 'customer_qr' && status === 'waiting_approval'`
  **no restaurante atual** (`isPendingCustomerOrder`,
  `src/utils/order-approval.ts`). Cada ação é por-pedido (não bloqueia a
  fila inteira), e um `409` (outro funcionário já agiu, ou status mudou)
  **sempre** dispara um refetch — o estado do backend sempre vence sobre
  qualquer suposição local.
- Permissão exigida: `approve_customer_orders`.
- Um restaurante pode desabilitar pedidos de clientes inteiramente
  (`RestaurantSettings.customer_ordering_enabled`) ou exigir aprovação
  manual de cada um (`customer_order_requires_approval`) — ambos
  configuráveis em Settings, nunca hardcoded no frontend.

## 5. Solicitações de mesa vs. chamadas de garçom (entidades distintas!)

Duas entidades que **parecem** a mesma coisa mas não são — nunca
confundir:

- **`TableRequest`** — criado pelo **cliente** via QR público
  (`POST /public/tables/{token}/requests/bill` ou `.../call-waiter`).
  Ciclo: `pending → acknowledged → completed`, ou `cancelled` a qualquer
  momento antes de completar. Tipos incluem pedir a conta e chamar o
  garçom.
- **`WaiterCall`** — iniciado pelo **staff** (ex.: garçom pede apoio do
  garçom responsável pela mesa), não pelo cliente.
- Ambas aparecem como `OperationsAlert` na UI operacional, mas com `type`s
  distintos (`customer_waiter_request_pending` /
  `bill_request_pending` vs. `responsible_waiter_call_pending`) — nunca
  tratadas como a mesma fila.

## 6. Fluxo público do QR (cliente, anônimo)

- Rota `/t/:publicToken` — **zero** conceito de conta AFORO. A guarda de
  rota nunca dispara `GET /me`/`GET /restaurants` para essa tela
  (`architecture.md` §7).
- Resolução da mesa (`GET /public/tables/{token}`,
  `usePublicTableResolution`) é **separada** do carregamento do menu
  (`GET /public/tables/{token}/menu`, `usePublicMenu`) — de propósito: se
  a carta ainda não foi publicada, o menu 404, mas a tela de entrada
  (intro/gateway/chamar garçom) continua funcionando porque depende só da
  resolução da mesa, nunca do menu.
- O carrinho (`usePublicCart`) e o estado de visita (`usePublicVisit`) são
  client-side até o envio do pedido — a confirmação/validação final é
  sempre do backend.
- Configurações do restaurante que afetam esse fluxo:
  `customer_ordering_enabled`, `customer_order_requires_approval`,
  `waiter_call_enabled`, `bill_request_enabled` — todas vindas de
  `RestaurantSettings`, nunca assumidas como sempre ativas.

## 7. Fechamento diário (Day Close)

- Permissão para fechar o dia de **hoje**: `close_daily_operation`
  (tipicamente garçom/caixa). Ver histórico de fechamentos anteriores:
  `view_daily_closes` (tipicamente owner/manager) — a tela de detalhe/
  histórico exige especificamente essa última, nunca a primeira isolada.
- Sessões vazias/abandonadas podem ser encerradas via **void** (§3.6) a
  partir da tela de fechamento diário.

## 8. Mapeamento tela → permissão (resumo de `router/index.ts`)

| Tela | Permissão mínima |
|---|---|
| Kitchen | `update_kitchen_status` OU `serve_orders` |
| Menu | `manage_menu` |
| Tables (configuração) | `manage_tables` (+ `manage_floor_plan` para estrutura — ver §2) |
| Service (operação) | sem gate único — auto-gate por seção (ver §2) |
| Staff | `manage_users` |
| Feedback | `view_customer_feedback` |
| Day Close | `close_daily_operation` OU `view_daily_closes` |
| Day Close — detalhe/histórico | `view_daily_closes` |
| Settings | sem gate único — mistura `manage_restaurants` (restaurante) e `manage_organization` (organização) |
| Dashboard | sem gate único — contas puramente operacionais são redirecionadas para sua tela de trabalho real |

## 9. Gaps e divergências conhecidas (honestidade sobre o que não está 100%)

- **`CLAUDE.md` §9 está desatualizado.** Ele descreve um gap onde
  `GET /auth/me` não retornaria papéis/permissões. O código real
  (`src/stores/auth.ts`, `src/types/auth-context.ts`,
  `src/composables/usePermissions.ts`, `src/router/index.ts`) já implementa
  um sistema completo de permissões via `GET /auth/context`, com guardas de
  rota e `can()`/`canOrganization()`/`canPlatform()` em uso ativo. Vale
  atualizar essa seção do `CLAUDE.md` numa tarefa dedicada — não foi feito
  aqui porque está fora do escopo (só documentação, sem tocar em
  `CLAUDE.md`).
- **Catálogo de papéis não existe no backend.** Nenhum endpoint expõe a
  lista de papéis atribuíveis; `ASSIGNABLE_STAFF_ROLES`
  (`src/types/staff.ts`) é hardcoded no frontend como único lugar da
  verdade até existir um catálogo real.
- **`docs/realtime.md` é referenciado no código mas não existe** no
  repositório (`src/realtime/echo.ts`,
  `src/composables/useRestaurantRealtime.ts`). O catálogo de eventos
  Reverb/Echo não está documentado centralizadamente hoje.
- **Recibo de conta é operacional, não fiscal** — não confundir com
  obrigação legal de faturação; o próprio backend descreve isso na OpenAPI.
