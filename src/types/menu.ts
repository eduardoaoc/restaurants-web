/**
 * Shape confirmed against the live backend's OpenAPI spec (restaurants-api,
 * L5 Swagger at /docs?api-docs.json, schema `Menu`) — GET/POST/PATCH
 * /api/v1/restaurants/{restaurant}/menu all return exactly these fields.
 * `status` has no documented enum on the backend (plain string, example
 * "active") — kept as an open union so an unexpected value never breaks
 * rendering, the same pattern as PermissionSlug (src/types/auth-context.ts).
 * Only `active`/`inactive` are offered as choices in the edit UI (CLAUDE.md
 * §16: never invent draft/published/archived states that aren't confirmed).
 */
export type MenuStatus = 'active' | 'inactive' | (string & {})

export interface Menu {
  id: number
  restaurant_id: number
  name: string
  status: MenuStatus
  created_at: string
  updated_at: string
}

/** POST body — both fields are optional per the OpenAPI requestBody, but the create UI always sends `name`. */
export interface CreateMenuPayload {
  name: string
}

/** PATCH body — only real, confirmed fields (CLAUDE.md §14): no description/image/theme/schedule. */
export interface UpdateMenuPayload {
  name?: string
  status?: MenuStatus
}
