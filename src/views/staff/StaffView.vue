<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus, PhUsersThree } from '@phosphor-icons/vue'

import StaffDetailPanel from '@/components/staff/StaffDetailPanel.vue'
import StaffForm from '@/components/staff/StaffForm.vue'
import StaffRow from '@/components/staff/StaffRow.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useOrganizationStaff } from '@/composables/useOrganizationStaff'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import { staffRoleLabelKey } from '@/utils/staff'
import type { CreateStaffPayload, StaffMember, UpdateStaffPayload } from '@/types/staff'

/**
 * "Equipo" — the owner's view of the people who work here (CLAUDE.md Passo
 * 2.8). Deliberately reads as a team roster, never as a user/role/pivot
 * administration screen: no ids, no permission slugs, no "user_roles".
 *
 * The list is ORGANIZATION-wide because that is what GET /api/v1/staff
 * actually returns (scoped server-side to the restaurants the requester can
 * reach) — a person can work in several restaurants, and the UI shows each
 * of them rather than pretending one person belongs to one restaurant.
 */
const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

const canManageUsers = computed(() => can('manage_users'))

const { staff, loading, error, saving, saveError, activeShiftByUserId, canReadShifts, createStaff, updateStaff } =
  useOrganizationStaff(() => canManageUsers.value)

type PanelMode = 'none' | 'detail' | 'create' | 'edit'

const panelMode = ref<PanelMode>('none')
const selectedId = ref<number | null>(null)
const query = ref('')
const roleFilter = ref<string>('all')

const selectedMember = computed(() => staff.value.find((member) => member.id === selectedId.value) ?? null)

/**
 * A restaurant switch can also switch organization (the backend resolves the
 * active organization from the tenant context), so any open person/form must
 * close — otherwise the panel would keep showing someone who no longer
 * belongs to the visible roster (§38/§39).
 */
watch(
  () => restaurantStore.currentRestaurantId,
  () => {
    panelMode.value = 'none'
    selectedId.value = null
    query.value = ''
    roleFilter.value = 'all'
  },
)

/** Filters are built from the roles actually present, never a hardcoded list. */
const availableRoleFilters = computed(() => {
  const slugs = new Set<string>()
  for (const member of staff.value) {
    if (member.role) slugs.add(member.role.slug)
  }
  return [...slugs].sort()
})

const filteredStaff = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return staff.value.filter((member) => {
    if (roleFilter.value !== 'all' && member.role?.slug !== roleFilter.value) return false
    if (!needle) return true

    const roleLabel = member.role ? t(staffRoleLabelKey(member.role.slug)) : ''
    return (
      member.name.toLowerCase().includes(needle) ||
      member.email.toLowerCase().includes(needle) ||
      roleLabel.toLowerCase().includes(needle)
    )
  })
})

function select(member: StaffMember): void {
  selectedId.value = member.id
  panelMode.value = 'detail'
}

function startCreate(): void {
  selectedId.value = null
  panelMode.value = 'create'
}

async function onSave(payload: CreateStaffPayload | UpdateStaffPayload): Promise<void> {
  if (panelMode.value === 'create') {
    const err = await createStaff(payload as CreateStaffPayload)
    if (!err) panelMode.value = 'none'
    return
  }

  if (panelMode.value === 'edit' && selectedId.value !== null) {
    const err = await updateStaff(selectedId.value, payload as UpdateStaffPayload)
    if (!err) panelMode.value = 'detail'
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-headline font-bold text-on-surface">{{ t('staff.pageTitle') }}</h2>
        <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('staff.pageSubtitle') }}</p>
      </div>
      <AButton v-if="canManageUsers && staff.length > 0" @click="startCreate">
        <template #leading><PhPlus :size="16" /></template>
        {{ t('staff.addPerson') }}
      </AButton>
    </div>

    <ASurface v-if="!canManageUsers" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('staff.errors.forbidden') }}</p>
    </ASurface>

    <template v-else>
      <div v-if="loading" class="flex items-center justify-center py-16">
        <AProgress />
      </div>

      <ASurface
        v-else-if="error"
        tone="container"
        radius="lg"
        role="alert"
        class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
      >
        <p class="text-title-md font-medium">{{ describeApiError(error, t) }}</p>
      </ASurface>

      <!-- Nobody yet: invite the first action rather than showing an empty list. -->
      <ASurface v-else-if="staff.length === 0" tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <PhUsersThree :size="22" aria-hidden="true" />
          </span>
          <div>
            <h3 class="text-title-lg font-semibold text-on-surface">{{ t('staff.empty.title') }}</h3>
            <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('staff.empty.subtitle') }}</p>
          </div>
        </div>
        <AButton class="mt-5" @click="startCreate">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('staff.addPerson') }}
        </AButton>
      </ASurface>

      <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div class="flex flex-col gap-3">
          <ATextField v-model="query" :label="t('staff.searchLabel')" :placeholder="t('staff.searchPlaceholder')">
            <template #leading><PhMagnifyingGlass :size="18" /></template>
          </ATextField>

          <div class="flex flex-wrap items-center gap-1" role="group" :aria-label="t('staff.filterLabel')">
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="roleFilter === 'all' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="roleFilter === 'all'"
              @click="roleFilter = 'all'"
            >
              {{ t('staff.filters.all') }}
            </button>
            <button
              v-for="slug in availableRoleFilters"
              :key="slug"
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="roleFilter === slug ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="roleFilter === slug"
              @click="roleFilter = slug"
            >
              {{ t(staffRoleLabelKey(slug)) }}
            </button>
          </div>

          <!-- Announced on change so a screen-reader user hears the result
               count after typing a search or picking a filter, and it doubles
               as the plain answer to "how many people work here?". -->
          <p class="text-label-md text-on-surface-variant" role="status" aria-live="polite">
            {{ t('staff.count', filteredStaff.length) }}
          </p>

          <ASurface tone="container" radius="lg" bordered class="p-2">
            <p v-if="filteredStaff.length === 0" class="px-2 py-4 text-body-md text-on-surface-variant">
              {{ t('staff.noResults') }}
            </p>

            <ul v-else class="flex flex-col divide-y divide-outline-variant" :aria-label="t('staff.listLabel')">
              <li v-for="member in filteredStaff" :key="member.id">
                <StaffRow
                  :member="member"
                  :active-shift="activeShiftByUserId[member.id] ?? null"
                  :shifts-visible="canReadShifts"
                  :selected="selectedId === member.id && panelMode !== 'create'"
                  @select="select(member)"
                />
              </li>
            </ul>
          </ASurface>
        </div>

        <div class="flex flex-col gap-4">
          <ASurface v-if="panelMode === 'create' || panelMode === 'edit'" tone="container" radius="lg" bordered class="p-4">
            <h3 class="text-title-md font-medium text-on-surface">
              {{ panelMode === 'create' ? t('staff.form.createTitle') : t('staff.form.editTitle') }}
            </h3>
            <div class="mt-3">
              <StaffForm
                :key="panelMode === 'edit' ? `edit-${selectedId}` : 'create'"
                :mode="panelMode === 'create' ? 'create' : 'edit'"
                :member="panelMode === 'edit' ? (selectedMember ?? undefined) : undefined"
                :saving="saving"
                :error="saveError"
                @save="onSave"
                @cancel="panelMode = selectedMember ? 'detail' : 'none'"
              />
            </div>
          </ASurface>

          <StaffDetailPanel
            v-else-if="panelMode === 'detail' && selectedMember"
            :key="selectedMember.id"
            :member="selectedMember"
            :active-shift="activeShiftByUserId[selectedMember.id] ?? null"
            :shifts-visible="canReadShifts"
            :can-edit="canManageUsers"
            @edit="panelMode = 'edit'"
          />

          <ASurface v-else tone="container" radius="lg" bordered class="p-6">
            <p class="text-body-md text-on-surface-variant">{{ t('staff.selectHint') }}</p>
          </ASurface>
        </div>
      </div>
    </template>
  </div>
</template>
