import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { invitationsService } from '@/services/invitations.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CreateStaffInvitationPayload, Invitation } from '@/types/invitation'

/**
 * Staff invitations of the ACTIVE organization (GET /api/v1/staff/invitations,
 * already filtered server-side to the restaurants the requester manages).
 *
 * Same lifecycle discipline as useOrganizationStaff: refetch + abort on a
 * restaurant/organization switch, and drop any response that belongs to a
 * previous generation, so one organization's invitations never show up
 * under another.
 */
export function useStaffInvitations(enabled: () => boolean) {
  const restaurantStore = useRestaurantStore()

  const invitations = ref<Invitation[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)
  const busyId = ref<number | null>(null)
  const itemErrors = ref<Record<number, ApiError | null>>({})

  let controller: AbortController | null = null
  let generation = 0
  let disposed = false

  async function fetchInvitations(): Promise<void> {
    controller?.abort()
    const local = new AbortController()
    controller = local
    loading.value = true
    error.value = null
    try {
      const result = await invitationsService.listStaff(local.signal)
      if (!local.signal.aborted) invitations.value = result
    } catch (err) {
      if (local.signal.aborted) return
      error.value = normalizeApiError(err)
      invitations.value = []
    } finally {
      if (!local.signal.aborted) loading.value = false
    }
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([restaurantId, isEnabled]) => {
      ++generation
      controller?.abort()
      invitations.value = []
      itemErrors.value = {}
      saveError.value = null
      error.value = null
      loading.value = false
      if (isEnabled && restaurantId !== null) void fetchInvitations()
    },
    { immediate: true, flush: 'sync' },
  )

  function upsert(updated: Invitation): void {
    invitations.value = invitations.value.some((item) => item.id === updated.id)
      ? invitations.value.map((item) => (item.id === updated.id ? updated : item))
      : [updated, ...invitations.value]
  }

  async function invite(payload: CreateStaffInvitationPayload): Promise<Invitation | null> {
    if (saving.value || disposed || !enabled()) return null
    const token = generation
    saving.value = true
    saveError.value = null
    try {
      const created = await invitationsService.inviteStaff(payload)
      if (token !== generation || disposed) return null
      upsert(created)
      return created
    } catch (err) {
      if (token === generation && !disposed) saveError.value = normalizeApiError(err)
      return null
    } finally {
      saving.value = false
    }
  }

  async function act(invitation: Invitation, action: 'resend' | 'revoke'): Promise<void> {
    if (busyId.value !== null || disposed) return
    const token = generation
    busyId.value = invitation.id
    itemErrors.value = { ...itemErrors.value, [invitation.id]: null }
    try {
      const updated = action === 'resend'
        ? await invitationsService.resendStaff(invitation.id)
        : await invitationsService.revokeStaff(invitation.id)
      if (token === generation && !disposed) upsert(updated)
    } catch (err) {
      if (token === generation && !disposed) itemErrors.value = { ...itemErrors.value, [invitation.id]: normalizeApiError(err) }
    } finally {
      busyId.value = null
    }
  }

  onBeforeUnmount(() => { disposed = true; ++generation; controller?.abort() })

  return { invitations, loading, error, saving, saveError, busyId, itemErrors, invite, act, refresh: fetchInvitations }
}
