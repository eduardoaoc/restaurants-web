/**
 * Shape confirmed against the live backend (restaurants-api,
 * App\Http\Controllers\Api\V1\Auth\AuthController) — GET /api/v1/auth/me
 * and POST /api/v1/auth/login both return exactly these fields. The User
 * model hides `password` and `remember_token`; nothing else is appended.
 *
 * No organization/restaurant/role/permission data is exposed here yet — the
 * backend doesn't return it from these endpoints. See CLAUDE.md §10 and the
 * FRONT BLOCO 1 report for what to wire once it does.
 */
export interface AuthenticatedUser {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  created_at: string
  updated_at: string
}

export interface LoginPayload {
  email: string
  password: string
  remember?: boolean
}
