import { onBeforeUnmount, ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { organizationService } from '@/services/organization.service'
import type { Organization, UpdateOrganizationPayload } from '@/types/organization'

/**
 * The active organization's own editable profile (Passo 2.10) — distinct
 * from usePermissions().currentOrganizationContext, which is a read
 * projection for authorization decisions, never the source of truth for
 * a settings form. `enabled` mirrors every other gated composable in this
 * app (useRestaurantOperations, useRestaurantMenu, ...): while the current
 * user lacks `manage_organization`, this never calls GET /organization at
 * all, so a restaurant-only manager viewing Ajustes never fires a request
 * the backend would 403.
 */
export function useOrganizationSettings(enabled: () => boolean = () => true) {
  const organization = ref<Organization | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  async function load(): Promise<void> {
    controller?.abort()
    error.value = null

    if (!enabled()) {
      organization.value = null
      loading.value = false
      return
    }

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await organizationService.get(signal)
      if (signal.aborted) return
      organization.value = result
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
      organization.value = null
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  async function update(payload: UpdateOrganizationPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      organization.value = await organizationService.update(payload)
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(() => controller?.abort())

  return { organization, loading, error, saving, saveError, load, update }
}
