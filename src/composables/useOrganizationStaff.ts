import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { staffService } from '@/services/staff.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CreateStaffPayload, StaffMember, StaffShift, UpdateStaffPayload } from '@/types/staff'

/**
 * The organization's staff, as the Staff API actually models it: GET
 * /api/v1/staff returns everyone in the ACTIVE ORGANIZATION (server-side
 * scoped to the restaurants the requester can reach), not one restaurant's
 * roster. A person may be assigned to several restaurants at once.
 *
 * The active organization is resolved server-side from the tenant context,
 * which follows the current restaurant — so switching restaurants can also
 * switch organizations. Everything here therefore re-fetches on a
 * restaurant change and aborts whatever was in flight, which is what keeps
 * one organization's people from ever appearing under another
 * (CLAUDE.md Passo 2.8 §38/§39).
 *
 * Active shifts are fetched separately and ONLY when the user holds
 * `manage_staff_shifts` — a different permission from the `manage_users`
 * that gates this screen — so a user without it never fires a request the
 * backend would 403.
 */
export function useOrganizationStaff(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()
  const { can } = usePermissions()

  const staff = ref<StaffMember[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)

  const activeShifts = ref<StaffShift[]>([])
  const canReadShifts = computed(() => can('manage_staff_shifts'))

  let controller: AbortController | null = null
  let shiftsController: AbortController | null = null

  function abortAll(): void {
    controller?.abort()
    shiftsController?.abort()
    controller = null
    shiftsController = null
  }

  async function fetchStaff(): Promise<void> {
    controller?.abort()
    const localController = new AbortController()
    controller = localController
    const { signal } = localController

    loading.value = true
    error.value = null

    try {
      const result = await staffService.list(signal)
      if (signal.aborted) return
      staff.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
      staff.value = []
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  async function fetchActiveShifts(): Promise<void> {
    shiftsController?.abort()
    activeShifts.value = []

    const restaurantId = restaurantStore.currentRestaurantId
    if (restaurantId === null || !canReadShifts.value) return

    const localController = new AbortController()
    shiftsController = localController
    const { signal } = localController

    try {
      const result = await staffService.listActiveShifts(restaurantId, signal)
      if (signal.aborted) return
      activeShifts.value = result.filter((shift) => shift.is_active)
    } catch {
      // A shift read failing must never break the roster — the badge simply
      // doesn't appear. Silent by design: shifts are supplementary here.
      if (!signal.aborted) activeShifts.value = []
    }
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([restaurantId, isEnabled]) => {
      abortAll()
      if (!isEnabled || restaurantId === null) {
        staff.value = []
        activeShifts.value = []
        error.value = null
        loading.value = false
        return
      }
      void fetchStaff()
      void fetchActiveShifts()
    },
    { immediate: true },
  )

  /** user_id -> the active shift they are currently on, if any. */
  const activeShiftByUserId = computed<Record<number, StaffShift>>(() => {
    const map: Record<number, StaffShift> = {}
    for (const shift of activeShifts.value) {
      if (shift.user) map[shift.user.id] = shift
    }
    return map
  })

  async function createStaff(payload: CreateStaffPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const created = await staffService.create(payload)
      staff.value = [...staff.value, created]
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function updateStaff(userId: number, payload: UpdateStaffPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const updated = await staffService.update(userId, payload)
      staff.value = staff.value.map((member) => (member.id === userId ? updated : member))
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(abortAll)

  return {
    staff,
    loading,
    error,
    saving,
    saveError,
    activeShiftByUserId,
    canReadShifts,
    createStaff,
    updateStaff,
    refresh: fetchStaff,
  }
}
