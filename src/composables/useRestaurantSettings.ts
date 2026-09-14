import { onBeforeUnmount, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { restaurantsService } from '@/services/restaurants.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { Restaurant, RestaurantSettings, UpdateRestaurantPayload, UpdateRestaurantSettingsPayload } from '@/types/restaurant'

/**
 * `updateProfile`/`updateSettings` resolve to this instead of a bare
 * `ApiError | null` (race-condition fix): `applied` is false when the
 * response arrived after the user had already switched to a different
 * restaurant — the request still succeeded/failed and persisted (or not)
 * for its OWN restaurant, but nothing about it was applied to whatever is
 * currently on screen. Callers must never show a "saved"/error state off
 * `error` alone — only when `applied` is also true, or a stale save for A
 * would flash a false "Cambios guardados." (or a stale error) under B's
 * form.
 */
export interface RestaurantMutationResult {
  error: ApiError | null
  applied: boolean
}

/**
 * Per-restaurant, per-domain mutation bookkeeping (race-condition fix #2 —
 * A → Save #1 → B → A → Save #2, both captured `targetRestaurantId === A`,
 * so restaurant-id alone can't tell which of the two responses is newer).
 * One of these lives per restaurantId, in a Map scoped to ONE domain
 * (profile XOR settings) — Profile and Settings never share a lock, and
 * restaurant A's entry is completely independent of B's.
 *
 * - `pending` is the single-flight gate: updateProfile/updateSettings
 *   refuse to fire a second PATCH for a restaurant+domain that already has
 *   one in flight. This is what stops the backend from ever seeing two
 *   concurrent writes to the same resource (CLAUDE.md §23 — no
 *   ETag/version-column/optimistic-locking added backend-side; the fix is
 *   the frontend never creating the race in the first place) — with at
 *   most one in-flight PATCH per key, responses cannot arrive out of the
 *   order they were sent, so a version counter can never actually be
 *   needed for correctness here.
 * - `version` is kept anyway as a defense-in-depth assertion (bumped on
 *   every attempt for that key): a resolving request only ever paints
 *   itself onto shared state if `state.version` still matches the version
 *   it captured when it started. Because of the single-flight gate above
 *   this is always true in practice — it costs nothing and documents the
 *   invariant explicitly rather than relying only on "the lock happens to
 *   make this safe".
 * - `error` is the last RESOLVED attempt's error for that key (or null),
 *   so returning to a restaurant whose save already failed while the user
 *   was elsewhere can still show that error correctly (never a stale one
 *   from a superseded attempt, since a new attempt clears it immediately).
 */
interface DomainMutationState {
  version: number
  pending: boolean
  error: ApiError | null
}

function mutationStateFor(map: Map<number, DomainMutationState>, restaurantId: number): DomainMutationState {
  let state = map.get(restaurantId)
  if (!state) {
    state = { version: 0, pending: false, error: null }
    map.set(restaurantId, state)
  }
  return state
}

/**
 * The CURRENT restaurant's own editable profile (name) plus its
 * operational settings (Passo 2.10) — both gated on the same
 * `manage_restaurants` permission (RestaurantPolicy::update /
 * ::manageSettings), so one `enabled` gate covers both.
 *
 * Re-fetches cleanly on every restaurant switch (same shape as
 * useRestaurantMenu/useOrganizationStaff): aborts whatever was in flight
 * for the previous restaurant so a slow response can never overwrite the
 * new restaurant's form with stale data (Passo 2.10 §18 — no draft
 * leaking from A into B).
 *
 * `updateProfile`/`updateSettings` add two more, independent protections
 * on top of that abort (race-condition fixes, reviewed separately from the
 * original Passo 2.10):
 *   1. Each captures `restaurantStore.currentRestaurantId` as its own
 *      target BEFORE awaiting the PATCH, and only writes to this
 *      composable's `restaurant`/`settings`/saving/error refs if that is
 *      STILL the current restaurant once the response comes back (fix #1
 *      — A's response never paints itself onto B's screen).
 *   2. Per-restaurant, per-domain single-flight + version bookkeeping
 *      (`profileMutations`/`settingsMutations`, fix #2) — a second save for
 *      the SAME restaurant+domain is refused outright while the first is
 *      still in flight, so A/profile Save #1 and Save #2 (both captured
 *      `targetRestaurantId === A`) can never race each other or the
 *      backend. `savingProfile`/`savingSettings`/the error refs are
 *      re-derived from this per-restaurant memory every time the current
 *      restaurant changes (`syncMutationRefs`), so returning to A while its
 *      own save is still pending correctly shows loading again — the
 *      memory of "A still has a mutation in flight" survives the A → B → A
 *      round trip, it just isn't visible while B is on screen.
 * The PATCH itself is never aborted in either case — it's fine (and
 * correct) for A's save to finish and persist on the backend after the
 * user has moved on; the guards only ever stop a response from being
 * painted onto the wrong screen or racing a newer attempt for the same key.
 */
export function useRestaurantSettings(enabled: () => boolean = () => true) {
  const restaurantStore = useRestaurantStore()

  const restaurant = ref<Restaurant | null>(null)
  const settings = ref<RestaurantSettings | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const savingProfile = ref(false)
  const profileSaveError = ref<ApiError | null>(null)
  const savingSettings = ref(false)
  const settingsSaveError = ref<ApiError | null>(null)

  const profileMutations = new Map<number, DomainMutationState>()
  const settingsMutations = new Map<number, DomainMutationState>()

  /**
   * Re-derives the visible saving/error refs for whichever restaurant is
   * now current, from that restaurant's own per-domain memory — called on
   * every restaurant switch (including switching BACK to a restaurant with
   * a mutation still in flight, or one whose last mutation already failed).
   */
  function syncMutationRefs(restaurantId: number | null): void {
    const profileState = restaurantId !== null ? profileMutations.get(restaurantId) : undefined
    savingProfile.value = profileState?.pending ?? false
    profileSaveError.value = profileState?.pending ? null : (profileState?.error ?? null)

    const settingsState = restaurantId !== null ? settingsMutations.get(restaurantId) : undefined
    savingSettings.value = settingsState?.pending ?? false
    settingsSaveError.value = settingsState?.pending ? null : (settingsState?.error ?? null)
  }

  let controller: AbortController | null = null

  async function fetch(restaurantId: number | null): Promise<void> {
    controller?.abort()
    restaurant.value = null
    settings.value = null
    error.value = null
    syncMutationRefs(restaurantId)

    if (restaurantId === null || !enabled()) {
      loading.value = false
      return
    }

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      // The Restaurant record itself is already loaded in restaurantStore —
      // reused here rather than a second GET /restaurants/{id} that doesn't
      // exist as a single-resource route beyond what list() already fetched.
      const found = restaurantStore.restaurants.find((r) => r.id === restaurantId) ?? null
      const settingsResult = await restaurantsService.settings(restaurantId)
      if (signal.aborted) return
      restaurant.value = found
      settings.value = settingsResult
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  watch(
    () => [restaurantStore.currentRestaurantId, enabled()] as const,
    ([id]) => void fetch(id),
    { immediate: true },
  )

  async function updateProfile(payload: UpdateRestaurantPayload): Promise<RestaurantMutationResult> {
    const targetRestaurantId = restaurantStore.currentRestaurantId
    if (targetRestaurantId === null) return { error: null, applied: false }

    const state = mutationStateFor(profileMutations, targetRestaurantId)
    if (state.pending) {
      // Single-flight (race-condition fix #2 §6/§12): a profile save for
      // THIS restaurant is already in flight — never fire a second,
      // overlapping PATCH for the same restaurant+domain. The Save button
      // is already disabled/loading whenever this restaurant is current
      // (syncMutationRefs), so this only ever guards a caller that
      // bypasses that (e.g. a forced/scripted double-submit).
      return { error: null, applied: false }
    }

    const myVersion = ++state.version
    state.pending = true
    state.error = null
    if (restaurantStore.currentRestaurantId === targetRestaurantId) {
      savingProfile.value = true
      profileSaveError.value = null
    }

    try {
      const updated = await restaurantsService.update(targetRestaurantId, payload)
      // Always keep the global restaurants cache correct for this
      // restaurant, regardless of version/current-ness — safe by
      // construction, see applyRestaurantUpdate's own docblock (indexed by
      // `updated.id`, never by "whichever restaurant is current").
      restaurantStore.applyRestaurantUpdate(updated)

      // Defense in depth on top of single-flight (§9/§11): only ever paint
      // this onto the visible form if it's both the CURRENT restaurant and
      // still the most recent attempt for it.
      const stillLatest = state.version === myVersion
      const applied = stillLatest && restaurantStore.currentRestaurantId === targetRestaurantId
      if (applied) restaurant.value = updated
      return { error: null, applied }
    } catch (err) {
      const normalized = normalizeApiError(err)
      const stillLatest = state.version === myVersion
      if (stillLatest) state.error = normalized
      const applied = stillLatest && restaurantStore.currentRestaurantId === targetRestaurantId
      if (applied) profileSaveError.value = normalized
      return { error: normalized, applied }
    } finally {
      if (state.version === myVersion) state.pending = false
      if (restaurantStore.currentRestaurantId === targetRestaurantId) {
        savingProfile.value = mutationStateFor(profileMutations, targetRestaurantId).pending
      }
    }
  }

  async function updateSettings(payload: UpdateRestaurantSettingsPayload): Promise<RestaurantMutationResult> {
    const targetRestaurantId = restaurantStore.currentRestaurantId
    if (targetRestaurantId === null) return { error: null, applied: false }

    const state = mutationStateFor(settingsMutations, targetRestaurantId)
    if (state.pending) {
      // Single-flight, independent lock from profileMutations (§13) — a
      // settings save for this restaurant already in flight blocks only
      // another settings save for the SAME restaurant, never Profile.
      return { error: null, applied: false }
    }

    const myVersion = ++state.version
    state.pending = true
    state.error = null
    if (restaurantStore.currentRestaurantId === targetRestaurantId) {
      savingSettings.value = true
      settingsSaveError.value = null
    }

    try {
      const updated = await restaurantsService.updateSettings(targetRestaurantId, payload)
      const stillLatest = state.version === myVersion
      // Store-level guard (applySettingsUpdate) drops this itself if the
      // restaurant has changed since — only called here at all if this is
      // still the latest attempt for its own restaurant+domain key
      // (§11 option A: never hand the store a response that's already
      // been superseded).
      if (stillLatest) restaurantStore.applySettingsUpdate(targetRestaurantId, updated)

      const applied = stillLatest && restaurantStore.currentRestaurantId === targetRestaurantId
      if (applied) settings.value = updated
      return { error: null, applied }
    } catch (err) {
      const normalized = normalizeApiError(err)
      const stillLatest = state.version === myVersion
      if (stillLatest) state.error = normalized
      const applied = stillLatest && restaurantStore.currentRestaurantId === targetRestaurantId
      if (applied) settingsSaveError.value = normalized
      return { error: normalized, applied }
    } finally {
      if (state.version === myVersion) state.pending = false
      if (restaurantStore.currentRestaurantId === targetRestaurantId) {
        savingSettings.value = mutationStateFor(settingsMutations, targetRestaurantId).pending
      }
    }
  }

  onBeforeUnmount(() => controller?.abort())

  return {
    restaurant,
    settings,
    loading,
    error,
    savingProfile,
    profileSaveError,
    savingSettings,
    settingsSaveError,
    updateProfile,
    updateSettings,
  }
}
