# Onboarding e convites (frontend)

Relatório completo (backend + frontend, testes, pendências, checklist manual):
`restaurants-api/docs/onboarding-invitations-report.md`.

Resumo do frontend:

- `/platform/onboarding` (`PlatformLayout` + `PlatformOnboardingView`): alta de
  restaurante pelo Super Admin (`create_platform_restaurants`), organização
  nova ou existente, `Idempotency-Key` por rascunho, resumo, estado do convite
  (estado e entrega em linhas separadas), reenviar com cooldown, cancelar com
  confirmação, reconvidar dono.
- `/invitation#token=…` (`InvitationAcceptView`): token lido do fragmento uma
  vez e removido do URL; prévia; conta nova (nome + senha) ou existente
  (senha atual); sessão de outra pessoa → "Cerrar sesión".
- Equipo: "Invitar persona" sem senha (`StaffForm` em modo convite),
  `useStaffInvitations` + `InvitationItem` para pendentes/caducados.
- `UserMenu`: troca de organização (2+ memberships) via
  `PUT /auth/active-organization`, limpando restaurante/realtime antes de
  recarregar; link para Plataforma.
- `src/api/session.ts`: endpoints de convite liberados no guard de sessão
  encerrada (são usados justamente sem sessão).
- Testes: `tests/frontend-invitations.mjs` (50 verificações com dublês locais).

Atualização 2026-10-22: recuperação de senha (`/forgot-password`,
`/reset-password#token=…&email=…`, `ForgotPasswordView`/`ResetPasswordView`,
link no login e no aceite com conta existente) e `src/utils/url-secret.ts`
(primeiro import do `main.ts`, remove o segredo do URL de `/invitation` e
`/reset-password` antes de qualquer outro módulo). Testes:
`tests/frontend-password-reset.mjs` (27). Relatório:
`restaurants-api/docs/pre-manual-hardening-report.md`.
