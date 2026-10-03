import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { dayCloseWhatsAppService } from '@/services/day-close-whatsapp.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { DayCloseWhatsAppSettings, UpdateDayCloseWhatsAppSettingsPayload } from '@/types/day-close-whatsapp'

export function useDayCloseWhatsAppSettings(enabled: () => boolean) {
  const restaurant = useRestaurantStore()
  const settings = ref<DayCloseWhatsAppSettings | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<ApiError | null>(null)
  const saveError = ref<ApiError | null>(null)
  const pending = new Set<number>()
  let sequence = 0
  let disposed = false
  let controller: AbortController | null = null

  async function load(): Promise<void> {
    const token = ++sequence
    const id = restaurant.currentRestaurantId
    controller?.abort()
    settings.value = null
    error.value = null
    saveError.value = null
    saving.value = id !== null && pending.has(id)
    loading.value = false
    if (id === null || !enabled() || disposed) return
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    try {
      const result = await dayCloseWhatsAppService.getSettings(id, signal)
      if (!disposed && token === sequence && !signal.aborted && id === restaurant.currentRestaurantId) settings.value = result
    } catch (err) {
      if (!disposed && token === sequence && !signal.aborted) error.value = normalizeApiError(err)
    } finally {
      if (!disposed && token === sequence) loading.value = false
    }
  }

  async function update(payload: UpdateDayCloseWhatsAppSettingsPayload): Promise<boolean> {
    const id = restaurant.currentRestaurantId
    if (id === null || !enabled() || pending.has(id) || disposed) return false
    const token = sequence
    pending.add(id)
    saving.value = true
    saveError.value = null
    const current = () => !disposed && enabled() && token === sequence && id === restaurant.currentRestaurantId
    try {
      const result = await dayCloseWhatsAppService.updateSettings(id, payload)
      if (!current()) return false
      settings.value = result
      return true
    } catch (err) {
      if (current()) saveError.value = normalizeApiError(err)
      return false
    } finally {
      pending.delete(id)
      if (!disposed && id === restaurant.currentRestaurantId) {
        saving.value = false
        // A → B → A while a save finishes: replace an earlier GET with authoritative data.
        if (token !== sequence && enabled()) void load()
      }
    }
  }

  watch(() => [restaurant.currentRestaurantId, enabled()], () => void load(), { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; ++sequence; controller?.abort() })
  return { settings, loading, saving, error, saveError, load, update }
}
